import DisasterDataDownloaderV2 from '@/components/DisasterDataDownloaderV2'
import NavLinksV2 from '@/components/NavLinksV2'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Top accent bar (full bleed); nav links live in the hero, opposite the stats */}
      <div className="h-1 bg-gradient-to-r from-[#003A63] via-[#00A79D] to-[#89684F]" />
      <DisasterDataDownloaderV2 useSBAData={true} headerRight={<NavLinksV2 />} />
    </main>
  )
}
