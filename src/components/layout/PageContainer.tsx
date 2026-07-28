import { cn } from "@/lib/utils"

type PageContainerProps = React.ComponentProps<"div"> & {
  contentClassName?: string
}

export function PageContainer({
  children,
  className,
  contentClassName,
  ...props
}: PageContainerProps): React.JSX.Element {
  return (
    <div
      {...props}
      data-page-container
      className={cn(className, "mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 lg:px-6")}
    >
      <div className={cn("w-full", contentClassName)}>{children}</div>
    </div>
  )
}
