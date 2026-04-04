import { styled } from 'styled-components'

export const ToggleSwitch = styled.label<{
  $checked: boolean | null
  $disabled?: boolean
}>`
  ${({ $checked }) => {
    const trackColor = $checked === null
      ? '#5f6b76'
      : ($checked ? '#13bf11' : '#b91c1c')
    const knobShadow = $checked === null
      ? `
        inset 0 0 0 0.12rem #94a3b8,
        0.15rem 0.15rem rgba(59, 55, 55, 0.3)
      `
      : ($checked
        ? `
          inset 0 0 0 0.15rem #13bf11,
          0.15rem 0.15rem rgba(59, 55, 55, 0.3)
        `
        : `
          inset 0 0 0 0.12rem #b91c1c,
          0.15rem 0.15rem rgba(59, 55, 55, 0.3)
        `)

    return `
      --player-switch-track: ${trackColor};
      --player-switch-knob-shadow: ${knobShadow};
    `
  }}

  input {
    display: none;
  }

  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: inset 0 0 0rem 0.03rem black;
  background-color: var(--player-switch-track);
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

    ${({ $checked }) =>
      $checked === true
        ? `
          background-color: var(--player-switch-track);
          box-shadow: inset 0 0 0rem 0.03rem black;
          background: var(--player-switch-track);
          width: 2rem;
        `
        : ''};
  }

  &:after {
    content: '';
    position: absolute;
    top: 0;
    background: rgb(82, 73, 73);
    box-shadow: var(--player-switch-knob-shadow);
    transition: 0.4s ease-in-out;
    height: 1rem;
    width: 1rem;
    left: -0.06rem;
    border-radius: 1rem;

    ${({ $checked }) =>
      $checked === true
        ? `
          box-shadow: var(--player-switch-knob-shadow);
          left: 1rem;
        `
        : ''};
  }
`

export const PlayerEnabledByUserSwitch = ToggleSwitch
