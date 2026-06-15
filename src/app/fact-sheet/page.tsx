import FactSheetCreator from '@/components/FactSheetCreator'
import NavigationV2 from '@/components/NavigationV2'

export default function FactSheetPage() {
  return (
    <main className="min-h-screen bg-white">
      <NavigationV2 />
      <FactSheetCreator useSBAData={true} />
    </main>
  )
}
