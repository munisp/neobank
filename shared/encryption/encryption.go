package encryption

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	vault "github.com/hashicorp/vault/api"
	auth "github.com/hashicorp/vault/api/auth/kubernetes"
	"golang.org/x/crypto/hkdf"
)

var (
	ErrInvalidCiphertext = errors.New("invalid ciphertext format")
	ErrDecryptionFailed  = errors.New("decryption failed")
	ErrKeyNotFound       = errors.New("encryption key not found")
	ErrVaultUnavailable  = errors.New("vault service unavailable")
)

type EncryptionConfig struct {
	VaultAddr          string
	VaultRole          string
	VaultNamespace     string
	TransitMountPath   string
	DefaultKeyName     string
	CacheEnabled       bool
	CacheTTL           time.Duration
	FallbackToLocal    bool
	LocalKeyPath       string
}

type EncryptedData struct {
	Version     int    `json:"v"`
	KeyID       string `json:"kid"`
	KeyVersion  int    `json:"kv"`
	Nonce       string `json:"n"`
	Ciphertext  string `json:"ct"`
	Tag         string `json:"tag,omitempty"`
	Context     string `json:"ctx,omitempty"`
	Algorithm   string `json:"alg"`
	EncryptedAt int64  `json:"ts"`
}

type DataKey struct {
	Plaintext  []byte
	Ciphertext string
	KeyVersion int
}

type EncryptionService struct {
	config      *EncryptionConfig
	vaultClient *vault.Client
	keyCache    map[string]*cachedKey
	cacheMu     sync.RWMutex
	localKey    []byte
	initialized bool
	mu          sync.Mutex
}

type cachedKey struct {
	key       []byte
	expiresAt time.Time
}

func NewEncryptionService(config *EncryptionConfig) (*EncryptionService, error) {
	if config == nil {
		config = &EncryptionConfig{
			VaultAddr:        getEnv("VAULT_ADDR", "https://vault.vault.svc.cluster.local:8200"),
			VaultRole:        getEnv("VAULT_ROLE", "neobank-backend"),
			VaultNamespace:   getEnv("VAULT_NAMESPACE", ""),
			TransitMountPath: getEnv("VAULT_TRANSIT_PATH", "transit"),
			DefaultKeyName:   getEnv("VAULT_DEFAULT_KEY", "neobank-pii"),
			CacheEnabled:     true,
			CacheTTL:         5 * time.Minute,
			FallbackToLocal:  getEnv("ENCRYPTION_FALLBACK_LOCAL", "false") == "true",
			LocalKeyPath:     getEnv("LOCAL_ENCRYPTION_KEY_PATH", "/etc/neobank/encryption.key"),
		}
	}

	svc := &EncryptionService{
		config:   config,
		keyCache: make(map[string]*cachedKey),
	}

	if err := svc.initialize(); err != nil {
		if config.FallbackToLocal {
			if err := svc.initializeLocalKey(); err != nil {
				return nil, fmt.Errorf("failed to initialize encryption service: %w", err)
			}
		} else {
			return nil, fmt.Errorf("failed to initialize vault client: %w", err)
		}
	}

	return svc, nil
}

func (s *EncryptionService) initialize() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.initialized {
		return nil
	}

	vaultConfig := vault.DefaultConfig()
	vaultConfig.Address = s.config.VaultAddr

	client, err := vault.NewClient(vaultConfig)
	if err != nil {
		return fmt.Errorf("failed to create vault client: %w", err)
	}

	if s.config.VaultNamespace != "" {
		client.SetNamespace(s.config.VaultNamespace)
	}

	k8sAuth, err := auth.NewKubernetesAuth(
		s.config.VaultRole,
		auth.WithServiceAccountTokenPath("/var/run/secrets/kubernetes.io/serviceaccount/token"),
	)
	if err != nil {
		return fmt.Errorf("failed to create kubernetes auth: %w", err)
	}

	authInfo, err := client.Auth().Login(context.Background(), k8sAuth)
	if err != nil {
		return fmt.Errorf("failed to authenticate with vault: %w", err)
	}

	if authInfo == nil {
		return errors.New("no auth info returned from vault")
	}

	s.vaultClient = client
	s.initialized = true

	go s.renewToken(authInfo)

	return nil
}

func (s *EncryptionService) renewToken(authInfo *vault.Secret) {
	watcher, err := s.vaultClient.NewLifetimeWatcher(&vault.LifetimeWatcherInput{
		Secret: authInfo,
	})
	if err != nil {
		return
	}

	go watcher.Start()
	defer watcher.Stop()

	for {
		select {
		case <-watcher.DoneCh():
			s.mu.Lock()
			s.initialized = false
			s.mu.Unlock()
			s.initialize()
			return
		case <-watcher.RenewCh():
		}
	}
}

func (s *EncryptionService) initializeLocalKey() error {
	keyData, err := os.ReadFile(s.config.LocalKeyPath)
	if err != nil {
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return fmt.Errorf("failed to generate local key: %w", err)
		}
		s.localKey = key
		return nil
	}

	decoded, err := base64.StdEncoding.DecodeString(string(keyData))
	if err != nil {
		return fmt.Errorf("failed to decode local key: %w", err)
	}

	s.localKey = decoded
	return nil
}

func (s *EncryptionService) Encrypt(ctx context.Context, plaintext []byte, keyName string) (string, error) {
	if keyName == "" {
		keyName = s.config.DefaultKeyName
	}

	if s.vaultClient != nil {
		return s.encryptWithVault(ctx, plaintext, keyName)
	}

	if s.localKey != nil {
		return s.encryptLocal(plaintext, keyName)
	}

	return "", ErrVaultUnavailable
}

func (s *EncryptionService) encryptWithVault(ctx context.Context, plaintext []byte, keyName string) (string, error) {
	path := fmt.Sprintf("%s/encrypt/%s", s.config.TransitMountPath, keyName)

	encodedPlaintext := base64.StdEncoding.EncodeToString(plaintext)

	secret, err := s.vaultClient.Logical().WriteWithContext(ctx, path, map[string]interface{}{
		"plaintext": encodedPlaintext,
	})
	if err != nil {
		return "", fmt.Errorf("vault encryption failed: %w", err)
	}

	ciphertext, ok := secret.Data["ciphertext"].(string)
	if !ok {
		return "", errors.New("invalid response from vault")
	}

	keyVersion := 0
	if kv, ok := secret.Data["key_version"].(json.Number); ok {
		if v, err := kv.Int64(); err == nil {
			keyVersion = int(v)
		}
	}

	encData := &EncryptedData{
		Version:     1,
		KeyID:       keyName,
		KeyVersion:  keyVersion,
		Ciphertext:  ciphertext,
		Algorithm:   "vault-transit-aes256-gcm96",
		EncryptedAt: time.Now().Unix(),
	}

	jsonData, err := json.Marshal(encData)
	if err != nil {
		return "", fmt.Errorf("failed to marshal encrypted data: %w", err)
	}

	return base64.StdEncoding.EncodeToString(jsonData), nil
}

func (s *EncryptionService) encryptLocal(plaintext []byte, keyName string) (string, error) {
	derivedKey := s.deriveKey(s.localKey, keyName)

	block, err := aes.NewCipher(derivedKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	encData := &EncryptedData{
		Version:     1,
		KeyID:       keyName,
		KeyVersion:  1,
		Nonce:       base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:  base64.StdEncoding.EncodeToString(ciphertext),
		Algorithm:   "aes-256-gcm",
		EncryptedAt: time.Now().Unix(),
	}

	jsonData, err := json.Marshal(encData)
	if err != nil {
		return "", fmt.Errorf("failed to marshal encrypted data: %w", err)
	}

	return base64.StdEncoding.EncodeToString(jsonData), nil
}

func (s *EncryptionService) Decrypt(ctx context.Context, encryptedStr string) ([]byte, error) {
	jsonData, err := base64.StdEncoding.DecodeString(encryptedStr)
	if err != nil {
		return nil, ErrInvalidCiphertext
	}

	var encData EncryptedData
	if err := json.Unmarshal(jsonData, &encData); err != nil {
		return nil, ErrInvalidCiphertext
	}

	switch encData.Algorithm {
	case "vault-transit-aes256-gcm96":
		return s.decryptWithVault(ctx, &encData)
	case "aes-256-gcm":
		return s.decryptLocal(&encData)
	default:
		return nil, fmt.Errorf("unsupported algorithm: %s", encData.Algorithm)
	}
}

func (s *EncryptionService) decryptWithVault(ctx context.Context, encData *EncryptedData) ([]byte, error) {
	if s.vaultClient == nil {
		return nil, ErrVaultUnavailable
	}

	path := fmt.Sprintf("%s/decrypt/%s", s.config.TransitMountPath, encData.KeyID)

	secret, err := s.vaultClient.Logical().WriteWithContext(ctx, path, map[string]interface{}{
		"ciphertext": encData.Ciphertext,
	})
	if err != nil {
		return nil, fmt.Errorf("vault decryption failed: %w", err)
	}

	plaintextB64, ok := secret.Data["plaintext"].(string)
	if !ok {
		return nil, errors.New("invalid response from vault")
	}

	plaintext, err := base64.StdEncoding.DecodeString(plaintextB64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode plaintext: %w", err)
	}

	return plaintext, nil
}

func (s *EncryptionService) decryptLocal(encData *EncryptedData) ([]byte, error) {
	if s.localKey == nil {
		return nil, ErrKeyNotFound
	}

	derivedKey := s.deriveKey(s.localKey, encData.KeyID)

	block, err := aes.NewCipher(derivedKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(encData.Nonce)
	if err != nil {
		return nil, ErrInvalidCiphertext
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encData.Ciphertext)
	if err != nil {
		return nil, ErrInvalidCiphertext
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrDecryptionFailed
	}

	return plaintext, nil
}

func (s *EncryptionService) deriveKey(masterKey []byte, context string) []byte {
	hash := sha256.New
	hkdfReader := hkdf.New(hash, masterKey, []byte("neobank-encryption"), []byte(context))

	derivedKey := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, derivedKey); err != nil {
		return masterKey
	}

	return derivedKey
}

func (s *EncryptionService) GenerateDataKey(ctx context.Context, keyName string) (*DataKey, error) {
	if keyName == "" {
		keyName = s.config.DefaultKeyName
	}

	if s.vaultClient == nil {
		return s.generateLocalDataKey(keyName)
	}

	path := fmt.Sprintf("%s/datakey/plaintext/%s", s.config.TransitMountPath, keyName)

	secret, err := s.vaultClient.Logical().WriteWithContext(ctx, path, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to generate data key: %w", err)
	}

	plaintextB64, ok := secret.Data["plaintext"].(string)
	if !ok {
		return nil, errors.New("invalid response from vault")
	}

	ciphertext, ok := secret.Data["ciphertext"].(string)
	if !ok {
		return nil, errors.New("invalid response from vault")
	}

	plaintext, err := base64.StdEncoding.DecodeString(plaintextB64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode data key: %w", err)
	}

	keyVersion := 0
	if kv, ok := secret.Data["key_version"].(json.Number); ok {
		if v, err := kv.Int64(); err == nil {
			keyVersion = int(v)
		}
	}

	return &DataKey{
		Plaintext:  plaintext,
		Ciphertext: ciphertext,
		KeyVersion: keyVersion,
	}, nil
}

func (s *EncryptionService) generateLocalDataKey(keyName string) (*DataKey, error) {
	plaintext := make([]byte, 32)
	if _, err := rand.Read(plaintext); err != nil {
		return nil, fmt.Errorf("failed to generate data key: %w", err)
	}

	ciphertext, err := s.encryptLocal(plaintext, keyName)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt data key: %w", err)
	}

	return &DataKey{
		Plaintext:  plaintext,
		Ciphertext: ciphertext,
		KeyVersion: 1,
	}, nil
}

func (s *EncryptionService) DecryptDataKey(ctx context.Context, encryptedKey string, keyName string) ([]byte, error) {
	if keyName == "" {
		keyName = s.config.DefaultKeyName
	}

	if s.vaultClient == nil {
		decrypted, err := s.Decrypt(ctx, encryptedKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt data key: %w", err)
		}
		return decrypted, nil
	}

	path := fmt.Sprintf("%s/decrypt/%s", s.config.TransitMountPath, keyName)

	secret, err := s.vaultClient.Logical().WriteWithContext(ctx, path, map[string]interface{}{
		"ciphertext": encryptedKey,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt data key: %w", err)
	}

	plaintextB64, ok := secret.Data["plaintext"].(string)
	if !ok {
		return nil, errors.New("invalid response from vault")
	}

	plaintext, err := base64.StdEncoding.DecodeString(plaintextB64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode data key: %w", err)
	}

	return plaintext, nil
}

func (s *EncryptionService) Rewrap(ctx context.Context, encryptedStr string) (string, error) {
	jsonData, err := base64.StdEncoding.DecodeString(encryptedStr)
	if err != nil {
		return "", ErrInvalidCiphertext
	}

	var encData EncryptedData
	if err := json.Unmarshal(jsonData, &encData); err != nil {
		return "", ErrInvalidCiphertext
	}

	if s.vaultClient == nil {
		return encryptedStr, nil
	}

	path := fmt.Sprintf("%s/rewrap/%s", s.config.TransitMountPath, encData.KeyID)

	secret, err := s.vaultClient.Logical().WriteWithContext(ctx, path, map[string]interface{}{
		"ciphertext": encData.Ciphertext,
	})
	if err != nil {
		return "", fmt.Errorf("vault rewrap failed: %w", err)
	}

	newCiphertext, ok := secret.Data["ciphertext"].(string)
	if !ok {
		return "", errors.New("invalid response from vault")
	}

	keyVersion := 0
	if kv, ok := secret.Data["key_version"].(json.Number); ok {
		if v, err := kv.Int64(); err == nil {
			keyVersion = int(v)
		}
	}

	encData.Ciphertext = newCiphertext
	encData.KeyVersion = keyVersion
	encData.EncryptedAt = time.Now().Unix()

	newJsonData, err := json.Marshal(encData)
	if err != nil {
		return "", fmt.Errorf("failed to marshal encrypted data: %w", err)
	}

	return base64.StdEncoding.EncodeToString(newJsonData), nil
}

func (s *EncryptionService) Hash(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func (s *EncryptionService) DeterministicHash(data []byte, context string) string {
	key := s.deriveKey([]byte("neobank-search-token"), context)
	h := sha256.New()
	h.Write(key)
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

func (s *EncryptionService) EncryptString(ctx context.Context, plaintext string, keyName string) (string, error) {
	return s.Encrypt(ctx, []byte(plaintext), keyName)
}

func (s *EncryptionService) DecryptString(ctx context.Context, ciphertext string) (string, error) {
	plaintext, err := s.Decrypt(ctx, ciphertext)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (s *EncryptionService) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.initialized = false
	s.vaultClient = nil
	s.keyCache = make(map[string]*cachedKey)

	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

var defaultService *EncryptionService
var defaultServiceOnce sync.Once

func GetDefaultService() (*EncryptionService, error) {
	var err error
	defaultServiceOnce.Do(func() {
		defaultService, err = NewEncryptionService(nil)
	})
	return defaultService, err
}

func Encrypt(ctx context.Context, plaintext []byte, keyName string) (string, error) {
	svc, err := GetDefaultService()
	if err != nil {
		return "", err
	}
	return svc.Encrypt(ctx, plaintext, keyName)
}

func Decrypt(ctx context.Context, ciphertext string) ([]byte, error) {
	svc, err := GetDefaultService()
	if err != nil {
		return nil, err
	}
	return svc.Decrypt(ctx, ciphertext)
}

func EncryptString(ctx context.Context, plaintext string, keyName string) (string, error) {
	svc, err := GetDefaultService()
	if err != nil {
		return "", err
	}
	return svc.EncryptString(ctx, plaintext, keyName)
}

func DecryptString(ctx context.Context, ciphertext string) (string, error) {
	svc, err := GetDefaultService()
	if err != nil {
		return "", err
	}
	return svc.DecryptString(ctx, ciphertext)
}
