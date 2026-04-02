import { useEffect, useRef } from 'react'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { extensionVersion } from '@toolkit-tw-bot/release'
import { Container } from './style'
import imgLogo from '../../../icons/ico.green.128.png'

interface ILogo {
  isVisible?: boolean
  link?: string
  showLabel?: boolean
  compact?: boolean
}

const DEFAULT_LINK = 'https://api-controller-lets-go.herokuapp.com/'
const FIXED_SUBTITLE = 'Player Assistant'

function buildTooltipHtml(url: string) {
  return `
    <div style="display:flex; flex-direction:column; gap:0.35rem; min-width:14rem;">
      <strong style="color:#50fa7b; font-size:0.9rem; line-height:1.1;">Let's GO!</strong>
      <p style="margin:0; color:#f1fa8c; font-size:0.96rem; font-family:cursive; font-weight:600; line-height:1.1; opacity:0.9;">Player Assistant - Toolkit</p>
      <span style="display:inline-flex; align-items:center; align-self:flex-start; justify-content:center; padding:0.18rem 0.5rem; border-radius:999px; border:1px solid rgba(247, 226, 190, 0.16); background:rgba(255, 255, 255, 0.04); color:#f1fa8c; font-size:0.68rem; letter-spacing:0.06em; text-transform:uppercase;">v${extensionVersion}</span>
      <span style="color:rgba(248, 248, 242, 0.86); font-size:0.76rem;">Open page</span>
      <span style="color:rgba(248, 248, 242, 0.52); font-size:0.68rem; line-height:1.35; word-break:break-all;">${url}</span>
    </div>
  `
}

export default function Logo({ isVisible, link, showLabel = true, compact = false }: ILogo) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const targetUrl = link || DEFAULT_LINK

  useEffect(() => {
    const rootEl = rootRef.current

    if (!rootEl) {
      return undefined
    }

    const tooltip = new Tooltip({
      tooltipId: 'go-extension-logo-tooltip',
    })

    return tooltip.bind(rootEl, '[data-title]', (el) => el.getAttribute('data-title'))
  }, [targetUrl])

  const handleOpenPage = async () => {
    await chrome.tabs.create({
      url: targetUrl,
    })
  }

  return (
    <Container ref={rootRef} $isVisible={isVisible || false} $compact={compact}>
      <button
        type="button"
        data-title={buildTooltipHtml(targetUrl)}
        aria-label="Open Let's GO! page in a new tab"
        onClick={() => { void handleOpenPage() }}
      >
        <img src={imgLogo} alt="Let's GO!" />
        {showLabel ? (
          <span>
            <p>{FIXED_SUBTITLE}</p>
          </span>
        ) : null}
      </button>
    </Container>
  )
}
