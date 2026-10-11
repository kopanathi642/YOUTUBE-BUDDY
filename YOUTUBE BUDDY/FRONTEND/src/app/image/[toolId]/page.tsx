import { ToolStudio } from '@/components/studio/ToolStudio';

export default async function ImageToolPage({ params }: { params: Promise<{ toolId: string }> }) {
  const resolvedParams = await params;
  return <ToolStudio toolId={resolvedParams.toolId} category="image" />;
}
