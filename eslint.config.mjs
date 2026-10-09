import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        chrome: "readonly",
        browser: "readonly",
        globalThis: "readonly",
        console: "readonly",
        fetch: "readonly",
        alert: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        Image: "readonly",
        FileReader: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        Response: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        MutationObserver: "readonly",
        XMLHttpRequest: "readonly",
        CanvasRenderingContext2D: "readonly",
        HTMLCanvasElement: "readonly",
        WebGLRenderingContext: "readonly",
        WebGL2RenderingContext: "readonly",
        DeviceMotionEvent: "readonly",
        DeviceOrientationEvent: "readonly",
        PermissionStatus: "readonly",
        Geolocation: "readonly",
        atob: "readonly",
        btoa: "readonly",
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
        L: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-empty": ["warn", { "allowEmptyCatch": true }],
      "no-undef": "error"
    }
  },
  {
    ignores: [
      "dist/**",
      "lib/**",
      "node_modules/**"
    ]
  }
];
