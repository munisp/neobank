package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type UserClaims struct {
	UserID        string   `json:"sub"`
	Email         string   `json:"email"`
	EmailVerified bool     `json:"email_verified"`
	Name          string   `json:"name"`
	Username      string   `json:"preferred_username"`
	RealmRoles    []string `json:"realm_roles"`
	ClientRoles   []string `json:"client_roles"`
	KYCTier       string   `json:"kyc_tier"`
	Country       string   `json:"country"`
	Scope         string   `json:"scope"`
}

type KeycloakConfig struct {
	URL      string
	Realm    string
	ClientID string
}

type JWKSCache struct {
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
	mu        sync.RWMutex
}

var (
	jwksCache = &JWKSCache{
		keys: make(map[string]*rsa.PublicKey),
	}
	keycloakConfig *KeycloakConfig
)

func init() {
	keycloakConfig = &KeycloakConfig{
		URL:      getEnv("KEYCLOAK_URL", "http://keycloak.keycloak.svc.cluster.local:8080"),
		Realm:    getEnv("KEYCLOAK_REALM", "neobank"),
		ClientID: getEnv("KEYCLOAK_CLIENT_ID", "neobank-commodities"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func fetchJWKS() error {
	jwksURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", keycloakConfig.URL, keycloakConfig.Realm)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned status %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("failed to decode JWKS: %w", err)
	}

	jwksCache.mu.Lock()
	defer jwksCache.mu.Unlock()

	for _, key := range jwks.Keys {
		if key.Kty == "RSA" && key.Use == "sig" {
			pubKey, err := parseRSAPublicKey(key.N, key.E)
			if err != nil {
				continue
			}
			jwksCache.keys[key.Kid] = pubKey
		}
	}
	jwksCache.expiresAt = time.Now().Add(1 * time.Hour)

	return nil
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, err
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func getPublicKey(kid string) (*rsa.PublicKey, error) {
	jwksCache.mu.RLock()
	if time.Now().Before(jwksCache.expiresAt) {
		if key, ok := jwksCache.keys[kid]; ok {
			jwksCache.mu.RUnlock()
			return key, nil
		}
	}
	jwksCache.mu.RUnlock()

	if err := fetchJWKS(); err != nil {
		return nil, err
	}

	jwksCache.mu.RLock()
	defer jwksCache.mu.RUnlock()

	if key, ok := jwksCache.keys[kid]; ok {
		return key, nil
	}

	return nil, fmt.Errorf("key not found: %s", kid)
}

func KeycloakAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")

		if authHeader == "" {
			if userID := c.GetHeader("X-Authenticated-User"); userID != "" {
				c.Set("user_id", userID)
				c.Set("username", c.GetHeader("X-Authenticated-Username"))
				c.Set("email", c.GetHeader("X-Authenticated-Email"))
				c.Set("kyc_tier", c.GetHeader("X-User-KYC-Tier"))
				c.Set("country", c.GetHeader("X-User-Country"))
				c.Set("roles", strings.Split(c.GetHeader("X-User-Roles"), ","))
				c.Next()
				return
			}

			if os.Getenv("AUTH_MODE") == "demo" {
				c.Set("user_id", "demo_user")
				c.Set("username", "demo")
				c.Set("email", "demo@neobank.com")
				c.Set("kyc_tier", "tier_2")
				c.Set("country", "NG")
				c.Set("roles", []string{"user"})
				c.Next()
				return
			}

			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		tokenString := parts[1]

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}

			kid, ok := token.Header["kid"].(string)
			if !ok {
				return nil, fmt.Errorf("kid not found in token header")
			}

			return getPublicKey(kid)
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("Invalid token: %v", err)})
			c.Abort()
			return
		}

		if !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token is not valid"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		userClaims := extractUserClaims(claims)

		c.Set("user_id", userClaims.UserID)
		c.Set("username", userClaims.Username)
		c.Set("email", userClaims.Email)
		c.Set("name", userClaims.Name)
		c.Set("kyc_tier", userClaims.KYCTier)
		c.Set("country", userClaims.Country)
		c.Set("roles", userClaims.RealmRoles)
		c.Set("claims", userClaims)

		ctx := context.WithValue(c.Request.Context(), "user_claims", userClaims)
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}

func extractUserClaims(claims jwt.MapClaims) *UserClaims {
	userClaims := &UserClaims{}

	if sub, ok := claims["sub"].(string); ok {
		userClaims.UserID = sub
	}
	if email, ok := claims["email"].(string); ok {
		userClaims.Email = email
	}
	if emailVerified, ok := claims["email_verified"].(bool); ok {
		userClaims.EmailVerified = emailVerified
	}
	if name, ok := claims["name"].(string); ok {
		userClaims.Name = name
	}
	if username, ok := claims["preferred_username"].(string); ok {
		userClaims.Username = username
	}
	if scope, ok := claims["scope"].(string); ok {
		userClaims.Scope = scope
	}

	if kycTier, ok := claims["kyc_tier"].(string); ok {
		userClaims.KYCTier = kycTier
	} else {
		userClaims.KYCTier = "tier_1"
	}

	if country, ok := claims["country"].(string); ok {
		userClaims.Country = country
	}

	if realmAccess, ok := claims["realm_access"].(map[string]interface{}); ok {
		if roles, ok := realmAccess["roles"].([]interface{}); ok {
			for _, role := range roles {
				if r, ok := role.(string); ok {
					userClaims.RealmRoles = append(userClaims.RealmRoles, r)
				}
			}
		}
	}

	if resourceAccess, ok := claims["resource_access"].(map[string]interface{}); ok {
		if clientAccess, ok := resourceAccess[keycloakConfig.ClientID].(map[string]interface{}); ok {
			if roles, ok := clientAccess["roles"].([]interface{}); ok {
				for _, role := range roles {
					if r, ok := role.(string); ok {
						userClaims.ClientRoles = append(userClaims.ClientRoles, r)
					}
				}
			}
		}
	}

	return userClaims
}

func GetUserID(c *gin.Context) string {
	if userID, exists := c.Get("user_id"); exists {
		return userID.(string)
	}
	return ""
}

func GetUserClaims(c *gin.Context) *UserClaims {
	if claims, exists := c.Get("claims"); exists {
		return claims.(*UserClaims)
	}
	return nil
}

func GetKYCTier(c *gin.Context) string {
	if tier, exists := c.Get("kyc_tier"); exists {
		return tier.(string)
	}
	return "tier_0"
}

func GetUserCountry(c *gin.Context) string {
	if country, exists := c.Get("country"); exists {
		return country.(string)
	}
	return ""
}

func HasRole(c *gin.Context, role string) bool {
	if roles, exists := c.Get("roles"); exists {
		for _, r := range roles.([]string) {
			if r == role {
				return true
			}
		}
	}
	return false
}
