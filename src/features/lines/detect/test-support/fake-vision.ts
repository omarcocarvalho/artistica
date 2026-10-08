import type { LandmarkerOptions, RawLandmark, VisionModule, WasmFileset } from '../landmark-api'

export interface Created {
  readonly model: 'face' | 'pose'
  readonly fileset: WasmFileset
  readonly options: LandmarkerOptions
  readonly factory: unknown
  closed: number
}

export interface FakeVision {
  readonly module: VisionModule
  readonly events: string[]
  readonly created: Created[]
  readonly scope: { ModuleFactory?: unknown }
  faces: RawLandmark[][]
  poses: RawLandmark[][]
  failCreate: Error | null
  hold: Promise<void> | null
}

export function point(i: number, visibility?: number): RawLandmark {
  return { x: i / 1000 + 1 / 3, y: i / 2000 + 1 / 7, z: -i / 10, visibility }
}

export function landmarks(n: number, count: number, withVisibility = false): RawLandmark[][] {
  return Array.from({ length: n }, (_, f) =>
    Array.from({ length: count }, (_, i) =>
      point(f * count + i, withVisibility ? i / count : undefined),
    ),
  )
}

/** Like 0.10.35: a loader URL sets ModuleFactory only the first time; each create clears it. */
export function fakeVision(): FakeVision {
  const scope: { ModuleFactory?: unknown } = {}
  const imported = new Set<string>()
  const fake: FakeVision = {
    events: [],
    created: [],
    scope,
    faces: landmarks(1, 478),
    poses: landmarks(1, 33, true),
    failCreate: null,
    hold: null,
    module: undefined as unknown as VisionModule,
  }

  const create =
    (model: 'face' | 'pose') => async (fileset: WasmFileset, options: LandmarkerOptions) => {
      fake.events.push(`create ${model}`)
      if (fileset.wasmLoaderPath !== '' && !imported.has(fileset.wasmLoaderPath)) {
        imported.add(fileset.wasmLoaderPath)
        scope.ModuleFactory = `factory from ${fileset.wasmLoaderPath}`
      }
      if (fake.hold) await fake.hold
      if (fake.failCreate) throw fake.failCreate
      const factory = scope.ModuleFactory
      if (!factory) throw new Error('ModuleFactory not set.')
      scope.ModuleFactory = undefined
      const entry: Created = { model, fileset, options, factory, closed: 0 }
      fake.created.push(entry)
      return {
        detect: (image: ImageBitmap) => {
          fake.events.push(`detect ${model} ${String(image.width)}x${String(image.height)}`)
          return model === 'face'
            ? { faceLandmarks: fake.faces, landmarks: [] }
            : { faceLandmarks: [], landmarks: fake.poses }
        },
        close: () => {
          entry.closed++
          fake.events.push(`close ${model}`)
        },
      }
    }

  ;(fake as { module: VisionModule }).module = {
    FaceLandmarker: { createFromOptions: create('face') },
    PoseLandmarker: { createFromOptions: create('pose') },
  }
  return fake
}

export type TestBitmap = ImageBitmap & { closed: number }

export function bitmap(w = 64, h = 48): TestBitmap {
  const b = {
    width: w,
    height: h,
    closed: 0,
    close: () => {
      b.closed++
      b.width = 0
      b.height = 0
    },
  }
  return b
}
