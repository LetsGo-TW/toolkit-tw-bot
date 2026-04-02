export type TooltipContent = string | Node | DocumentFragment | null | undefined | false

export type TooltipRenderContext = {
  signal: AbortSignal
}

export type TooltipRenderFn = (
  el: Element,
  context: TooltipRenderContext,
) => TooltipContent | Promise<TooltipContent>

export type TooltipOptions = {
  tooltipId?: string
  root?: HTMLElement
  className?: string
  offsetX?: number
  offsetY?: number
  loadingHtml?: TooltipContent
  viewportPadding?: number
}

export type BindAttributeTooltipOptions = TooltipOptions & {
  tooltip?: Tooltip
  attributeName?: string
  renderFn?: TooltipRenderFn
}

export default class Tooltip {
  constructor(options?: TooltipOptions)
  bind(
    containerEl: Document | Element,
    selector: string,
    renderFn: TooltipRenderFn,
  ): () => void
  hide(): void
}

export declare function createAttributeTooltipRenderer(
  attributeName?: string,
): TooltipRenderFn

export declare function bindAttributeTooltip(
  containerEl: Document | Element,
  selector: string,
  options?: BindAttributeTooltipOptions,
): () => void
