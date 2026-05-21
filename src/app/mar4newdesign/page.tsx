import DisasterDataDownloaderV2 from '@/components/DisasterDataDownloaderV2'
import NavigationV2 from '@/components/NavigationV2'

export default function Mar4NewDesign() {
  return (
    <main className="min-h-screen bg-[#f7f8f9]">
      <NavigationV2 />
      <DisasterDataDownloaderV2 useSBAData={true} />
    </main>
  )
}