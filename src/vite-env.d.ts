declare module 'virtual:ai-assets' {
  export interface AiAsset {
    readonly url: string
    readonly bytes: number
    readonly sha256: string
  }
  export interface AiAssets {
    readonly runtimeLoader: AiAsset
    readonly runtimeWasm: AiAsset
    readonly face: AiAsset
    readonly pose: AiAsset
  }
  export const AI_ASSETS: AiAssets
}
