import React from 'react';
import { Fingerprint, Lock, Mail, User, WifiOff, ScanFace } from 'lucide-react';

export const BiometricsIcon = (props) => <ScanFace {...props} />;
export const LockIcon = (props) => <Lock {...props} />;
export const MailIcon = (props) => <Mail {...props} />;
export const UserIcon = (props) => <User {...props} />;
export const WifiOffIcon = (props) => <WifiOff {...props} />;
export const FingerprintIcon = (props) => <Fingerprint {...props} />;
