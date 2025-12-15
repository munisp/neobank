'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { videoKYCService } from '@/lib/api/video-kyc-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, Calendar, Clock, User, FileVideo, Plus } from 'lucide-react';

type VideoSession = {
  session_id: string;
  kyc_application_id: string;
  scheduled_time: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  agent_name?: string;
  recording_url?: string;
};

export default function VideoSessionsListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<VideoSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchSessions();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSessions();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredSessions(sessions);
    } else {
      setFilteredSessions(sessions.filter(s => s.status === statusFilter));
    }
  }, [statusFilter, sessions]);

  async function fetchSessions() {
    try {
      const data = await videoKYCService.getUserSessions();
      setSessions(data);
    } catch (error: any) {
      toast.error('Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelSession(sessionId: string) {
    if (!confirm('Are you sure you want to cancel this session?')) {
      return;
    }

    try {
      await videoKYCService.cancelSession(sessionId);
      toast.success('Session cancelled successfully');
      fetchSessions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel session');
    }
  }

  async function handleRescheduleSession(sessionId: string) {
    // In a real app, this would open a dialog with date/time picker
    toast.info('Reschedule functionality - redirect to schedule page with pre-filled data');
    router.push('/video-kyc/schedule');
  }

  function getStatusBadgeVariant(status: string) {
    switch (status) {
      case 'scheduled':
        return 'secondary';
      case 'in_progress':
        return 'default';
      case 'completed':
        return 'outline';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'scheduled':
        return 'text-blue-600';
      case 'in_progress':
        return 'text-yellow-600';
      case 'completed':
        return 'text-green-600';
      case 'cancelled':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading sessions...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Video KYC Sessions</h1>
            <p className="text-muted-foreground">
              Manage your video verification sessions
            </p>
          </div>
          <Button onClick={() => router.push('/video-kyc/schedule')}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule New Session
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Sessions</CardTitle>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Filter by status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sessions</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSessions.length === 0 ? (
              <div className="text-center py-12">
                <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">No sessions found</p>
                <p className="text-muted-foreground mb-4">
                  {statusFilter === 'all' 
                    ? "You haven't scheduled any video KYC sessions yet"
                    : `No ${statusFilter} sessions found`}
                </p>
                <Button onClick={() => router.push('/video-kyc/schedule')}>
                  Schedule Your First Session
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSessions.map((session) => (
                  <Card key={session.session_id} className="border-l-4" style={{
                    borderLeftColor: session.status === 'scheduled' ? '#3b82f6' :
                                   session.status === 'in_progress' ? '#eab308' :
                                   session.status === 'completed' ? '#22c55e' : '#ef4444'
                  }}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-3">
                            <Badge variant={getStatusBadgeVariant(session.status)}>
                              {session.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground font-mono">
                              {session.session_id}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="flex items-center space-x-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Scheduled Time</p>
                                <p className="text-sm font-medium">
                                  {new Date(session.scheduled_time).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Time</p>
                                <p className="text-sm font-medium">
                                  {new Date(session.scheduled_time).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>

                            {session.agent_name && (
                              <div className="flex items-center space-x-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Agent</p>
                                  <p className="text-sm font-medium">{session.agent_name}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">KYC Application:</span>{' '}
                            <span className="font-mono">{session.kyc_application_id}</span>
                          </div>
                        </div>

                        <div className="flex flex-col space-y-2 ml-4">
                          {session.status === 'scheduled' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => router.push(`/video-kyc/session/${session.session_id}`)}
                              >
                                Join Session
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRescheduleSession(session.session_id)}
                              >
                                Reschedule
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelSession(session.session_id)}
                              >
                                Cancel
                              </Button>
                            </>
                          )}

                          {session.status === 'in_progress' && (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/video-kyc/session/${session.session_id}`)}
                            >
                              Join Session
                            </Button>
                          )}

                          {session.status === 'completed' && session.recording_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(session.recording_url, '_blank')}
                            >
                              <FileVideo className="h-4 w-4 mr-2" />
                              View Recording
                            </Button>
                          )}

                          {session.status === 'completed' && !session.recording_url && (
                            <Badge variant="outline">No Recording</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>Sessions auto-refresh every 30 seconds</p>
        </div>
      </div>
    </div>
  );
}
