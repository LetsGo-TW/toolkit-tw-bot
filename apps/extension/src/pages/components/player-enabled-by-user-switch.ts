import { styled } from 'styled-components'

export const PlayerEnabledByUserSwitch = styled.label<{
  $enabledByUser: boolean
  $disabled?: boolean
}>`
  input {
    display: none;
  }

  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: inset 0 0 0rem 0.03rem black;
  background-color: ${({ $enabledByUser }) => ($enabledByUser ? '#13bf11' : 'red')};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  height: 1rem;
  max-width: 2rem;
  border-radius: 1rem;

  &:before {
    content: '';
    display: block;
    background: rgba(191, 87, 17, 0);
    transition: 0.4s ease-in-out;
    height: 1rem;
    width: 2rem;
    border-radius: 1rem;

    ${({ $enabledByUser }) =>
      $enabledByUser
        ? `
          background-color: #13bf11;
          box-shadow: inset 0 0 0rem 0.03rem black;
          background: #13bf11;
          width: 2rem;
        `
        : ''};
  }

  &:after {
    content: '';
    position: absolute;
    top: 0;
    background: rgb(82, 73, 73);
    box-shadow:
      inset 0 0 0 0.12rem red,
      0.15rem 0.15rem rgba(59, 55, 55, 0.3);
    transition: 0.4s ease-in-out;
    height: 1rem;
    width: 1rem;
    left: -0.06rem;
    border-radius: 1rem;

    ${({ $enabledByUser }) =>
      $enabledByUser
        ? `
          box-shadow:
            inset 0 0 0 0.15rem #13bf11,
            0.15rem 0.15rem rgba(59, 55, 55, 0.3);
          left: 1rem;
        `
        : ''};
  }
`
