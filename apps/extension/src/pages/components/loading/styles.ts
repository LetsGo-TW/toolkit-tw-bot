import { styled, css } from 'styled-components'

interface LoadingProps {
  $isLoading: boolean
}

export const LoadingContainer = styled.section<LoadingProps>`
  min-height: 12rem;
  padding: 1rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.surfaceBorder};
  background:
    radial-gradient(circle at top left, ${({ theme }) => theme.successAura}, transparent 42%),
    linear-gradient(180deg, ${({ theme }) => theme.surface} 0%, ${({ theme }) => theme.surfaceInner} 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  opacity: 1;
  transition: opacity 0.2s ease;

  ${({ $isLoading }) =>
    !$isLoading &&
    css`
      opacity: 0;
    `}
`

export const Spinner = styled.div`
  width: 3rem;
  height: 3rem;

  > div {
    width: 33%;
    height: 33%;
    background-color: ${({ theme }) => theme.success};
    float: left;
    -webkit-animation: sk-cubeGridScaleDelay 1.3s infinite ease-in-out;
    animation: sk-cubeGridScaleDelay 1.3s infinite ease-in-out;
  }
  .sk-cube1 {
    -webkit-animation-delay: 0.2s;
    animation-delay: 0.2s;
  }
  .sk-cube2 {
    -webkit-animation-delay: 0.3s;
    animation-delay: 0.3s;
  }
  .sk-cube3 {
    -webkit-animation-delay: 0.4s;
    animation-delay: 0.4s;
  }
  .sk-cube4 {
    -webkit-animation-delay: 0.1s;
    animation-delay: 0.1s;
  }
  .sk-cube5 {
    -webkit-animation-delay: 0.2s;
    animation-delay: 0.2s;
  }
  .sk-cube6 {
    -webkit-animation-delay: 0.3s;
    animation-delay: 0.3s;
  }
  .sk-cube7 {
    -webkit-animation-delay: 0s;
    animation-delay: 0s;
  }
  .sk-cube8 {
    -webkit-animation-delay: 0.1s;
    animation-delay: 0.1s;
  }
  .sk-cube9 {
    -webkit-animation-delay: 0.2s;
    animation-delay: 0.2s;
  }

  @-webkit-keyframes sk-cubeGridScaleDelay {
    0%,
    70%,
    100% {
      -webkit-transform: scale3D(1, 1, 1);
      transform: scale3D(1, 1, 1);
    }
    35% {
      -webkit-transform: scale3D(0, 0, 1);
      transform: scale3D(0, 0, 1);
    }
  }

  @keyframes sk-cubeGridScaleDelay {
    0%,
    70%,
    100% {
      -webkit-transform: scale3D(1, 1, 1);
      transform: scale3D(1, 1, 1);
    }
    35% {
      -webkit-transform: scale3D(0, 0, 1);
      transform: scale3D(0, 0, 1);
    }
  }
`

export const LoadingLabel = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`
