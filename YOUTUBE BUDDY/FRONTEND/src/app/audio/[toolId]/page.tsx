import { ToolStudio } from '@/components/studio/ToolStudio';

export default async function AudioToolPage({ params }: { params: Promise<{ toolId: string }> }) {
  const resolvedParams = await params;
  return <ToolStudio toolId={resolvedParams.toolId} category="audio" />;
}
