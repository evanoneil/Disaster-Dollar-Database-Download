import DisasterDataDownloader from '@/components/DisasterDataDownloader'
import Navigation from '@/components/Navigation'

export default function TestSBAHome() {
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <Navigation />
      <DisasterDataDownloader useSBAData={true} />
    </main>
  )
}
