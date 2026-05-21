import DisasterLookup from '@/components/DisasterLookup'

export default function DisasterLookupPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f9]">
      <DisasterLookup useSBAData={true} />
    </main>
  )
}
