import { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;

    ::-webkit-scrollbar {
      width: 3px;
      height: 3px;
    }
    ::-webkit-scrollbar-thumb {
      background: ${({ theme }) => theme.brand};
      border-radius: 0.8rem;
    }
    ::-webkit-scrollbar-track{
      background: ${({ theme }) => theme.surfaceRaised};
      border-radius: 0.8rem;
    }
  }

  html {
    width: 100%;
    height: auto;
    min-height: 0;
  }

  body {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    transition: all 0.50s linear;
    color:${({ theme }) => theme.textPrimary};
    background: ${({ theme }) => theme.background};
  }

  body, html, #root {
    width: 100%;
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  body,
  input,
  textarea,
  button {
    font: 400 1rem "Poppins", sans-serif;
    
    @media (orientation: landscape) and (max-height: 780px) {
      font-size: 0.8rem;
    }
  }

  button {
    cursor: pointer;
  }

  a {
    color: ${({ theme }) => theme.brand};
    text-decoration: none;
    cursor: pointer;
  }
  
  ul {
    list-style:none;
  }

  p {
    color: ${({ theme }) => theme.textSecondary};
  }

  .toastContainer {
    position: absolute !important;
    padding: 0.2rem;
    font-size: 1rem;
  }
`
