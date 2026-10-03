import { APP_NAME } from '../shared/app-info'

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">{APP_NAME}</h1>
      <p className="text-lg">The workspace is coming soon.</p>
    </main>
  )
}
