import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ApiClient } from './src/api';

const Field = ({ label, value, onChangeText, secureTextEntry = false }: { label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean }) => <TextInput accessibilityLabel={label} autoCapitalize="none" onChangeText={onChangeText} placeholder={label} secureTextEntry={secureTextEntry} style={styles.input} value={value} />;
const Button = ({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;

export default function App() {
  const api = useMemo(() => new ApiClient(), []);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { api.restore().then(setSignedIn).finally(() => setReady(true)); }, [api]);
  if (!ready) return <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" />{signedIn ? <MemberHome api={api} onLogout={async () => { await api.logout(); setSignedIn(false); }} /> : <Auth api={api} onAuthenticated={() => setSignedIn(true)} />}</SafeAreaView>;
}

function Auth({ api, onAuthenticated }: { api: ApiClient; onAuthenticated: () => void }) {
  const [registering, setRegistering] = useState(false); const [verificationEmail, setVerificationEmail] = useState(''); const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { if (verificationEmail) { await api.verify(verificationEmail, code); onAuthenticated(); } else if (registering) { const result = await api.register(email, name, password); setVerificationEmail(email); if (result.development_code) setCode(String(result.development_code)); } else { await api.login(email, password); onAuthenticated(); } } catch (error) { Alert.alert('Unable to continue', String(error)); } finally { setBusy(false); } };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Text style={styles.brand}>AFhomes VIP</Text><Text style={styles.title}>{verificationEmail ? 'Verify email' : registering ? 'Create account' : 'Welcome back'}</Text>{verificationEmail ? <><Text>Enter the code sent to {verificationEmail}.</Text><Field label="Verification code" value={code} onChangeText={setCode} /></> : <><Field label="Email" value={email} onChangeText={setEmail} />{registering ? <Field label="Display name" value={name} onChangeText={setName} /> : null}<Field label="Password" value={password} onChangeText={setPassword} secureTextEntry /></>}<Button disabled={busy} label={busy ? 'Please wait…' : verificationEmail ? 'Verify' : 'Continue'} onPress={submit} />{verificationEmail ? null : <Pressable onPress={() => setRegistering(value => !value)}><Text style={styles.link}>{registering ? 'Already registered? Sign in' : 'Create customer account'}</Text></Pressable>}</ScrollView>;
}

function MemberHome({ api, onLogout }: { api: ApiClient; onLogout: () => void }) {
  const [home, setHome] = useState<any>(null); const [identifier, setIdentifier] = useState(''); const [activationCode, setActivationCode] = useState('');
  const load = async () => { try { setHome(await api.request('/api/v1/customer/me')); } catch (error) { Alert.alert('Unable to load membership', String(error)); } };
  useEffect(() => { void load(); }, []);
  const activate = async () => { try { await api.request('/api/v1/cards/activate', { method: 'POST', body: { card_identifier: identifier, activation_code: activationCode } }); await load(); } catch (error) { Alert.alert('Activation failed', String(error)); } };
  if (!home) return <View style={styles.center}><ActivityIndicator /></View>;
  const membership = home.membership; const card = home.card;
  return <ScrollView contentContainerStyle={styles.page}><View style={styles.row}><View><Text style={styles.brand}>AFhomes VIP</Text><Text style={styles.subtitle}>Hello, {home.customer.display_name}</Text></View><Pressable onPress={onLogout}><Text style={styles.link}>Sign out</Text></Pressable></View>{membership ? <View style={styles.card}><Text style={styles.title}>{membership.tier} VIP</Text><Text style={styles.points}>{membership.available_points} points</Text><Text>{membership.status} · valid until {new Date(membership.ends_at).toLocaleDateString()}</Text>{card ? <View style={styles.qr}><QRCode value={card.member_code} size={190} /><Text style={styles.memberCode}>{card.member_code}</Text><Text>{card.card_public_id}</Text></View> : null}</View> : <View style={styles.card}><Text style={styles.title}>Activate VIP</Text><Field label="QR, NFC, member, or card code" value={identifier} onChangeText={setIdentifier} /><Field label="One-time activation code" value={activationCode} onChangeText={setActivationCode} /><Button label="Activate card" onPress={activate} /></View>}<Text style={styles.caption}>Connected to the deployed AFhomes API</Text></ScrollView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f4f8fa' }, page: { flexGrow: 1, padding: 24, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, brand: { color: '#176b87', fontSize: 18, fontWeight: '800' }, title: { color: '#102a43', fontSize: 28, fontWeight: '800' }, subtitle: { color: '#486581', marginTop: 4 }, input: { backgroundColor: '#fff', borderColor: '#bcccdc', borderRadius: 12, borderWidth: 1, padding: 14 }, button: { alignItems: 'center', backgroundColor: '#176b87', borderRadius: 12, padding: 15 }, disabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '800' }, link: { color: '#176b87', fontWeight: '700', paddingVertical: 8 }, card: { backgroundColor: '#fff', borderRadius: 20, gap: 12, padding: 22, shadowColor: '#102a43', shadowOpacity: 0.08, shadowRadius: 12 }, points: { color: '#176b87', fontSize: 36, fontWeight: '800' }, qr: { alignItems: 'center', gap: 8, paddingTop: 16 }, memberCode: { fontSize: 18, fontWeight: '700', letterSpacing: 1 }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, caption: { color: '#829ab1', textAlign: 'center' } });
