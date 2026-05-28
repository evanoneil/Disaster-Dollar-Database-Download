import DisasterLookup from '@/components/DisasterLookup'

export default function DisasterLookupPage() {
  return (
    <main className="min-h-screen bg-white">
      <DisasterLookup useSBAData={true} />
    </main>
  )
}
