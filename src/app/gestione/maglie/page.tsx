import { JerseyAssignmentManager } from "@/components/jersey/JerseyAssignmentManager"
import { PageContainer } from "@/components/layout/PageContainer"

export default function JerseyAssignmentPage() {
  return (
    <PageContainer contentClassName="mx-auto max-w-4xl pb-24">
      <JerseyAssignmentManager />
    </PageContainer>
  )
}
