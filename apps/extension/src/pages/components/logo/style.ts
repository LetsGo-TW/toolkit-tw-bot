import { css, styled } from 'styled-components'

export const Container = styled.div<{ $isVisible: boolean, $compact?: boolean }>`
  transition: 0.6s;
  transform: scale(1);

  ${({ $isVisible }) =>
    $isVisible &&
    css`
      transform: scale(0);
    `}

  button {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    cursor: pointer;
  }

  button:hover img {
    transform: scale(1.04);
    box-shadow:
      0 0 0 2px ${({ theme }) => `${theme.success}33`},
      0 0 18px ${({ theme }) => `${theme.success}44`},
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  img {
    background:
      radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.14), transparent 38%),
      ${({ theme }) => theme.successAura};
    border: 1px solid ${({ theme }) => `${theme.success}55`};
    border-radius: 100%;
    width: ${({ $compact }) => ($compact ? '2.9rem' : '3.5rem')};
    height: auto;
    box-shadow:
      0 0 0 2px ${({ theme }) => `${theme.success}22`},
      0 0 14px ${({ theme }) => `${theme.success}33`},
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }

  span {
    display: inline-flex;
    align-items: center;
    color: ${({ theme }) => theme.textSecondary};
    font-size: 0.96rem;
    font-family: cursive;
    font-weight: 600;
    opacity: 90%;

    p {
      margin: 0;
      line-height: 1.1;
      white-space: nowrap;
    }
  }

  @media (max-width: 426px) {
    img {
      width: ${({ $compact }) => ($compact ? '2.7rem' : '3.2rem')};
    }
  }

  @media (max-width: 376px) {
    img {
      width: ${({ $compact }) => ($compact ? '2.55rem' : '3rem')};
    }
  }
`
