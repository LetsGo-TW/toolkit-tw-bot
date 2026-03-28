import { css, styled } from 'styled-components'

export const Container = styled.div<{ $isVisible: boolean }>`
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

  img {
    background: ${({ theme }) => theme.brand};
    border: 0.15rem solid;
    border-color: ${({ theme }) => theme.neutral};
    border-radius: 100%;
    width: 3.5rem;
    height: auto;
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
      width: 3.2rem;
    }
  }

  @media (max-width: 376px) {
    img {
      width: 3rem;
    }
  }
`
