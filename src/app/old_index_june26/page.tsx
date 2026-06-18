import DisasterDataDownloader from '@/components/DisasterDataDownloader'
import Navigation from '@/components/Navigation'

export default function OldIndexJune26() {
  return (
    <main className="min-h-screen py-8">
      <Navigation />
      <DisasterDataDownloader useSBAData={true} />
    </main>
  )
}
