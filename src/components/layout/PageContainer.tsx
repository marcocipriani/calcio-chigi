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
      className={cn("mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 lg:px-6", className)}
      data-page-container
      {...props}
    >
      <div className={cn("w-full", contentClassName)}>{children}</div>
    </div>
  )
}
