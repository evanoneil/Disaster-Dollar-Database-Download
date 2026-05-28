import DisasterDataDownloaderV2 from '@/components/DisasterDataDownloaderV2'
import NavigationV2 from '@/components/NavigationV2'

export default function Mar4NewDesign() {
  return (
    <main className="min-h-screen bg-white">
      <NavigationV2 />
      <DisasterDataDownloaderV2 useSBAData={true} />
    </main>
  )
}