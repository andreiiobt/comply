/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

const LOGO_URL = 'https://dtbspascjhwpommafcsh.supabase.co/storage/v1/object/public/content-images/email-assets%2Fiobt-logo.svg'

export const EmailChangeEmail = ({ siteName, email, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="IOBT" width="80" height="27" />
        </Section>
        <Section style={card}>
          <Heading style={h1}>Confirm email change</Heading>
          <Text style={text}>
            You requested to change your email address for <strong>{siteName}</strong>.
          </Text>
          <Text style={text}>
            From: <Link href={`mailto:${email}`} style={link}>{email}</Link>
            <br />
            To: <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>
          </Text>
          <Text style={text}>Click the button below to confirm this change:</Text>
          <Section style={buttonSection}>
            <Button style={button} href={confirmationUrl}>Confirm Email Change</Button>
          </Section>
          <Text style={expiry}>If you didn't request this change, please secure your account immediately.</Text>
        </Section>
        <Text style={footer}>
          &copy; {new Date().getFullYear()} IOBT. All rights reserved.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#F6F7F5', fontFamily: 'Inter, Arial, sans-serif' }
const container = { maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }
const logoSection = { marginBottom: '32px' }
const card = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '40px 36px', border: '1px solid #EFF2ED' }
const h1 = { fontSize: '24px', fontWeight: '700', color: '#0A2B02', margin: '0 0 16px', letterSpacing: '-0.5px' }
const text = { fontSize: '15px', color: '#555', lineHeight: '1.6', margin: '0 0 16px' }
const link = { color: '#0A2B02', textDecoration: 'underline' }
const buttonSection = { margin: '28px 0 20px' }
const button = { backgroundColor: '#0A2B02', color: '#C7FE9D', fontSize: '15px', fontWeight: '600', borderRadius: '999px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const expiry = { fontSize: '13px', color: '#999', margin: '0' }
const footer = { fontSize: '12px', color: '#aaa', margin: '24px 0 0', lineHeight: '1.6', textAlign: 'center' as const }
