import { Container } from './style'
import imgLogo from '../../icons/128.png'

interface ILogo {
  isVisible?: boolean
  subtitle?: string
  link?: string
}

const DEFAULT_LINK = 'https://api-controller-lets-go.herokuapp.com/'

export default function Logo({ isVisible, subtitle, link }: ILogo) {
  const handleOpenPage = async () => {
    await chrome.tabs.create({
      url: link || DEFAULT_LINK,
    })
  }

  return (
    <Container $isVisible={isVisible || false}>
      <button type="button" onClick={() => { void handleOpenPage() }}>
        <img src={imgLogo} alt="Let's GO!" />
      </button>
      {subtitle ? (
        <span>
          <p>{subtitle}</p>
        </span>
      ) : null}
    </Container>
  )
}
