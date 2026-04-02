/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

const LOGO_URL = 'https://dtbspascjhwpommafcsh.supabase.co/storage/v1/object/public/content-images/email-assets%2Fiobt-logo.svg'

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code for COMPLY</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="IOBT" width="80" height="27" />
        </Section>
        <Section style={card}>
          <Heading style={h1}>Verification code</Heading>
          <Text style={text}>Use the code below to confirm your identity in COMPLY:</Text>
          <Section style={codeBox}>
            <Text style={codeStyle}>{token}</Text>
          </Section>
          <Text style={expiry}>This code expires shortly. If you didn't request this, you can safely ignore this email.</Text>
        </Section>
        <Text style={footer}>
          &copy; {new Date().getFullYear()} IOBT. All rights reserved.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#F6F7F5', fontFamily: 'Inter, Arial, sans-serif' }
const container = { maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }
const logoSection = { marginBottom: '32px' }
const card = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '40px 36px', border: '1px solid #EFF2ED' }
const h1 = { fontSize: '24px', fontWeight: '700', color: '#0A2B02', margin: '0 0 16px', letterSpacing: '-0.5px' }
const text = { fontSize: '15px', color: '#555', lineHeight: '1.6', margin: '0 0 16px' }
const codeBox = { backgroundColor: '#F6F7F5', borderRadius: '12px', padding: '20px', margin: '24px 0', textAlign: 'center' as const }
const codeStyle = { fontFamily: 'Courier New, monospace', fontSize: '32px', fontWeight: '700', color: '#0A2B02', letterSpacing: '8px', margin: '0' }
const expiry = { fontSize: '13px', color: '#999', margin: '0' }
const footer = { fontSize: '12px', color: '#aaa', margin: '24px 0 0', lineHeight: '1.6', textAlign: 'center' as const }
