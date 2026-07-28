import { ManagementDashboard } from "@/components/management/ManagementDashboard"
import { PageContainer } from "@/components/layout/PageContainer"

export default function ManagementPage() {
  return (
    <PageContainer contentClassName="mx-auto max-w-7xl pb-24">
      <ManagementDashboard />
    </PageContainer>
  )
}
