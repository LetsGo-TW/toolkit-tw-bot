import { LoadingContainer, LoadingLabel, Spinner } from './styles'

type LoadingProps = {
  isLoading?: boolean
  label?: string | null
}

export default function Loading({
  isLoading = true,
  label = 'Loading...',
}: LoadingProps) {
  if (!isLoading) {
    return null
  }

  return (
    <LoadingContainer $isLoading={isLoading}>
      <Spinner>
        <div className="sk-cube1" />
        <div className="sk-cube2" />
        <div className="sk-cube3" />
        <div className="sk-cube4" />
        <div className="sk-cube5" />
        <div className="sk-cube6" />
        <div className="sk-cube7" />
        <div className="sk-cube8" />
        <div className="sk-cube9" />
      </Spinner>
      {label ? <LoadingLabel>{label}</LoadingLabel> : null}
    </LoadingContainer>
  )
}
