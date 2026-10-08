interface ServiceWorkerHost {
  readonly serviceWorker?: {
    register(url: string, options: RegistrationOptions): Promise<unknown>
  }
}

export async function registerServiceWorker(
  host: ServiceWorkerHost = navigator,
  production: boolean = import.meta.env.PROD,
  base: string = import.meta.env.BASE_URL,
): Promise<void> {
  if (!production || host.serviceWorker === undefined) return
  await host.serviceWorker
    .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
    .catch(() => undefined)
}
