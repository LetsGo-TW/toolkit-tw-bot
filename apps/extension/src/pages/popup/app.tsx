import styled from 'styled-components'
import { extensionVersion } from '@toolkit-tw-bot/release'

const Root = styled.main`
  width: 360px;
  min-height: 220px;
  padding: 20px;
  background:
    radial-gradient(circle at top left, rgba(247, 201, 72, 0.2), transparent 38%),
    linear-gradient(160deg, #19130f 0%, #2b1d16 100%);
  color: #f4e7cc;
  font-family: Georgia, 'Times New Roman', serif;
`

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 22px;
  line-height: 1.1;
`

const Subtitle = styled.p`
  margin: 0;
  color: #d8c8a8;
  font-size: 14px;
`

const Version = styled.span`
  display: inline-flex;
  margin-top: 16px;
  padding: 4px 8px;
  border: 1px solid rgba(244, 231, 204, 0.22);
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

export default function App() {
  return (
    <Root>
      <Title>Let&apos;s GO!</Title>
      <Subtitle>Toolkit Player Assistant</Subtitle>
      <Version>v{extensionVersion}</Version>
    </Root>
  )
}
