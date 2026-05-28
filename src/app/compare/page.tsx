import DisasterComparison from '@/components/DisasterComparison'
import NavigationV2 from '@/components/NavigationV2'

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-white">
      <NavigationV2 />
      <DisasterComparison useSBAData={true} />
    </main>
  )
}
