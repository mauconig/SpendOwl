import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppleMark, GoogleMark } from '../components/ProviderMark';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { colors, fonts } from '../theme';
import { t, tf } from '../i18n';

type Step = 'signIn' | 'signUp' | 'verify';
type Provider = 'google' | 'apple';

function Field({
  label,
  error,
  ...input
}: { label: string; error?: string | null } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: colors.textDim50, letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        placeholderTextColor={colors.textDim30}
        {...input}
        style={{
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: error ? colors.rose : colors.inputBorder,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 13,
          fontSize: 15,
          color: colors.text,
        }}
      />
      {error ? <Text style={{ fontSize: 12, color: colors.rose }}>{error}</Text> : null}
    </View>
  );
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: busy ? colors.textDim30 : '#F2F2F4',
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: 2,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 14.5, color: '#0A0A0B' }}>{busy ? t('Just a sec…') : label}</Text>
    </Pressable>
  );
}

function SSOButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: Provider;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const isGoogle = provider === 'google';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.cardAlt,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 14,
        paddingVertical: 13,
        opacity: disabled && !busy ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textDim55} />
      ) : (
        <>
          {isGoogle ? <GoogleMark size={17} /> : <AppleMark size={17} />}
          <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: colors.text }}>
            {isGoogle ? 'Google' : 'Apple'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function AuthScreen() {
  const { signIn, errors: signInErrors, fetchStatus: signInFetch } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetch } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = useState<Step>('signIn');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ssoBusy, setSsoBusy] = useState<Provider | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  const busy = signInFetch === 'fetching' || signUpFetch === 'fetching' || ssoBusy !== null;
  // The active step decides which resource's errors are on screen, so a stale
  // error from the other flow never leaks into the form the user is looking at.
  const errs = step === 'signIn' ? signInErrors : signUpErrors;
  const globalError = ssoError ?? errs.global?.[0]?.message ?? null;

  const handleSSO = async (provider: Provider) => {
    setSsoError(null);
    setSsoBusy(provider);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: provider === 'google' ? 'oauth_google' : 'oauth_apple',
      });
      // SSO is the one flow that still uses setActive() — finalize() does not
      // apply here. A null session id means the user closed the browser, which
      // is a cancellation, not an error, so it gets no message.
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
    } catch {
      setSsoError(tf('Could not sign in with {provider}. Please try again.', { provider: provider === 'google' ? 'Google' : 'Apple' }));
    } finally {
      setSsoBusy(null);
    }
  };

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;
    if (signIn.status === 'complete') await signIn.finalize();
  };

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress, password });
    if (error) return;
    if (signUp.status === 'complete') {
      await signUp.finalize();
      return;
    }
    if (signUp.unverifiedFields.includes('email_address')) {
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (!sendError) setStep('verify');
    }
  };

  const handleVerify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) return;
    if (signUp.status === 'complete') await signUp.finalize();
  };

  const swap = (next: Step) => {
    setStep(next);
    setCode('');
    setSsoError(null);
    // Drops the half-finished attempt on the Clerk side too, so switching
    // between sign-in and sign-up never resumes someone else's stale flow.
    void signIn.reset();
    void signUp.reset();
  };

  return (
    // Padding the wrapper (rather than using KeyboardAvoidingView, which is a
    // no-op on Android here) shrinks the ScrollView to the space above the
    // keyboard — same approach as ChatScreen. Centring the form only looks
    // right when there's room for it, so once the keyboard is up the content
    // pins to the top and the fields stay reachable by scrolling.
    <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: keyboardHeight > 0 ? 'flex-start' : 'center',
          padding: 20,
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={{ alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
          <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: colors.text }}>Nummus AI</Text>
          <Text style={{ fontSize: 13.5, color: colors.textDim50, textAlign: 'center' }}>
            {step === 'signIn'
              ? t('Sign in to pick up where you left off.')
              : step === 'signUp'
                ? t('Create an account to start tracking.')
                : `We sent a code to ${emailAddress}.`}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 20,
            padding: 18,
            gap: 14,
          }}
        >
          {globalError ? (
            <View
              style={{
                backgroundColor: 'rgba(248,113,113,.1)',
                borderWidth: 1,
                borderColor: 'rgba(248,113,113,.3)',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 12.5, color: colors.rose }}>{globalError}</Text>
            </View>
          ) : null}

          {step === 'verify' ? (
            <>
              <Field
                label={t('Verification code')}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                error={signUpErrors.fields.code?.message}
              />
              <PrimaryButton label={t('Verify email')} busy={busy} onPress={handleVerify} />
              <Pressable onPress={() => void signUp.verifications.sendEmailCode()} disabled={busy}>
                <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textDim55 }}>{t('Resend code')}</Text>
              </Pressable>
              <Pressable onPress={() => swap('signUp')}>
                <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textDim40 }}>{t('Use a different email')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field
                label={t('Email')}
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                error={
                  step === 'signIn'
                    ? signInErrors.fields.identifier?.message
                    : signUpErrors.fields.emailAddress?.message
                }
              />
              <Field
                label={t('Password')}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
                error={step === 'signIn' ? signInErrors.fields.password?.message : signUpErrors.fields.password?.message}
              />
              {step === 'signUp' && signUpErrors.fields.captcha ? (
                <Text style={{ fontSize: 12, color: colors.rose }}>{signUpErrors.fields.captcha.message}</Text>
              ) : null}
              <PrimaryButton
                label={step === 'signIn' ? t('Sign in') : t('Create account')}
                busy={busy}
                onPress={step === 'signIn' ? handleSignIn : handleSignUp}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.cardBorder }} />
                <Text style={{ fontSize: 11, color: colors.textDim40 }}>{t('or continue with')}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.cardBorder }} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <SSOButton
                  provider="google"
                  busy={ssoBusy === 'google'}
                  disabled={busy}
                  onPress={() => void handleSSO('google')}
                />
                <SSOButton
                  provider="apple"
                  busy={ssoBusy === 'apple'}
                  disabled={busy}
                  onPress={() => void handleSSO('apple')}
                />
              </View>
            </>
          )}
        </View>

        {step !== 'verify' ? (
          <Pressable onPress={() => swap(step === 'signIn' ? 'signUp' : 'signIn')}>
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textDim55 }}>
              {step === 'signIn' ? t('No account yet?') + ' ' : t('Already have an account?') + ' '}
              <Text style={{ fontFamily: fonts.bold, color: colors.text }}>
                {step === 'signIn' ? t('Sign up') : t('Sign in')}
              </Text>
            </Text>
          </Pressable>
        ) : null}

        {/* Clerk mounts its bot-protection widget here. The instance has captcha
            enabled, so every screen that can create a sign-up must render it. */}
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </View>
  );
}
