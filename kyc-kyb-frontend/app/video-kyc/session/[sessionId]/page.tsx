'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { videoKYCService } from '@/lib/api/video-kyc-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Video, Mic, MicOff, VideoOff, Phone, User, Clock, AlertCircle } from 'lucide-react';

type VideoSession = {
  session_id: string;
  kyc_application_id: string;
  scheduled_time: string;
  status: string;
  agent_name?: string;
  agent_id?: string;
  duration_minutes: number;
};

export default function VideoSessionPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [session, setSession] = useState<VideoSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const sessionId = params.sessionId;

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (session?.status === 'in_progress') {
      interval = setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [session?.status]);

  async function fetchSession() {
    setIsLoading(true);
    try {
      const data = await videoKYCService.getSession(sessionId);
      setSession(data);
    } catch (error: any) {
      toast.error('Failed to load session details');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartSession() {
    setIsStarting(true);
    try {
      await videoKYCService.startSession(sessionId);
      toast.success('Session started');
      fetchSession();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start session');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleEndSession() {
    if (!confirm('Are you sure you want to end this session?')) {
      return;
    }

    setIsEnding(true);
    try {
      await videoKYCService.completeSession(sessionId);
      toast.success('Session ended successfully');
      router.push('/video-kyc/sessions');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to end session');
    } finally {
      setIsEnding(false);
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Session Not Found</CardTitle>
            <CardDescription>The requested session could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/video-kyc/sessions')}>
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Video KYC Session</CardTitle>
                  <Badge variant={
                    session.status === 'in_progress' ? 'default' :
                    session.status === 'scheduled' ? 'secondary' :
                    'outline'
                  }>
                    {session.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Video Interface Placeholder */}
                <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center mb-4 relative">
                  {session.status === 'in_progress' ? (
                    <div className="text-center text-white">
                      <Video className="h-16 w-16 mx-auto mb-4" />
                      <p className="text-lg font-semibold">Video Call Active</p>
                      <p className="text-sm text-gray-300 mt-2">
                        Video SDK integration required (Agora/Twilio/Daily.co)
                      </p>
                      <div className="mt-4 text-2xl font-mono">
                        {formatTime(sessionTime)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-white">
                      <VideoOff className="h-16 w-16 mx-auto mb-4" />
                      <p className="text-lg font-semibold">Session Not Started</p>
                      <p className="text-sm text-gray-300 mt-2">
                        Click "Start Session" to begin
                      </p>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    disabled={session.status !== 'in_progress'}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsVideoOff(!isVideoOff)}
                    disabled={session.status !== 'in_progress'}
                  >
                    {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </Button>
                  {session.status === 'scheduled' && (
                    <Button
                      onClick={handleStartSession}
                      disabled={isStarting}
                      className="px-8"
                    >
                      {isStarting ? 'Starting...' : 'Start Session'}
                    </Button>
                  )}
                  {session.status === 'in_progress' && (
                    <Button
                      variant="destructive"
                      onClick={handleEndSession}
                      disabled={isEnding}
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      {isEnding ? 'Ending...' : 'End Session'}
                    </Button>
                  )}
                </div>

                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Note:</strong> This is a placeholder interface. Production implementation
                    requires integration with a video SDK like Agora, Twilio, or Daily.co.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          {/* Session Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Session Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Session ID</p>
                  <p className="font-mono text-sm">{session.session_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">KYC Application</p>
                  <p className="font-mono text-sm">{session.kyc_application_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Time</p>
                  <p className="text-sm">
                    {new Date(session.scheduled_time).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-sm">{session.duration_minutes} minutes</p>
                </div>
                {session.agent_name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Agent</p>
                    <div className="flex items-center mt-1">
                      <User className="h-4 w-4 mr-2" />
                      <p className="text-sm font-medium">{session.agent_name}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Ensure good lighting on your face</li>
                  <li>• Have your ID document ready</li>
                  <li>• Follow agent instructions carefully</li>
                  <li>• Speak clearly into the microphone</li>
                  <li>• Keep your face visible at all times</li>
                </ul>
              </CardContent>
            </Card>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/video-kyc/sessions')}
            >
              Back to Sessions
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
