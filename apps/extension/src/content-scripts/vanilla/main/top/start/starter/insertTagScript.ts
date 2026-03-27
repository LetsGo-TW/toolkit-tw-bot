const insertScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');

    script.src = src;
    script.async = false;

    script.onload = () => {
      script.remove();
      resolve();
    };

    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };

    (document.documentElement || document.head).appendChild(script);
  });

export default insertScript;
