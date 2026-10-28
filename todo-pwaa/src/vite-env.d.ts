/// <reference types="vite/cleinte"/>
/// <reference types="vite-plugin-pwa/react"/>

interface importMetaEnv{
    readonly VITE_API_URL: string;
}

interface importMeta{
    readonly env:ImportMetaEnv;
}

