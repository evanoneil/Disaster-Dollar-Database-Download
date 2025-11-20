import FactSheetCreator from '@/components/FactSheetCreator'
import Navigation from '@/components/Navigation'

export default function FactSheetPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <Navigation />
      <FactSheetCreator useSBAData={true} />
    </main>
  )
} 