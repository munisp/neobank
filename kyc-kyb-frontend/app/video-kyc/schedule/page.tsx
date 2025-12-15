'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { videoKYCService } from '@/lib/api/video-kyc-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Video, User } from 'lucide-react';

type TimeSlot = {
  time: string;
  available: boolean;
};

export default function ScheduleVideoKYCPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [kycApplicationId, setKycApplicationId] = useState('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSlots, setIsFetchingSlots] = useState(false);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedDate]);

  async function fetchAvailableSlots() {
    setIsFetchingSlots(true);
    try {
      const startDate = selectedDate;
      const endDate = selectedDate;
      const slots = await videoKYCService.getAvailableSlots(startDate, endDate);
      setAvailableSlots(slots);
    } catch (error: any) {
      toast.error('Failed to fetch available slots');
      setAvailableSlots([]);
    } finally {
      setIsFetchingSlots(false);
    }
  }

  async function handleSchedule() {
    if (!kycApplicationId || !selectedDate || !selectedTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    const scheduledTime = `${selectedDate}T${selectedTime}:00`;

    setIsLoading(true);
    try {
      const session = await videoKYCService.scheduleSession(
        kycApplicationId,
        scheduledTime,
        timezone
      );
      toast.success('Video KYC session scheduled successfully');
      router.push('/video-kyc/sessions');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to schedule session');
    } finally {
      setIsLoading(false);
    }
  }

  const timezones = [
    { value: 'Africa/Lagos', label: 'West Africa Time (WAT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'America/New_York', label: 'New York (EST)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  ];

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <Video className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-4xl font-bold mb-2">Schedule Video KYC Session</h1>
          <p className="text-muted-foreground">
            Book a live video verification session with our agents
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Session Details</CardTitle>
            <CardDescription>
              Select your preferred date and time for the video verification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                <User className="inline h-4 w-4 mr-1" />
                KYC Application ID
              </label>
              <Input
                value={kycApplicationId}
                onChange={(e) => setKycApplicationId(e.target.value)}
                placeholder="Enter your KYC application ID"
              />
              <p className="text-sm text-muted-foreground mt-1">
                You can find this in your KYC application status page
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Select Date
                </label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={today}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  <Clock className="inline h-4 w-4 mr-1" />
                  Timezone
                </label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedDate && (
              <div>
                <label className="block text-sm font-medium mb-3">
                  Available Time Slots
                </label>
                {isFetchingSlots ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading available slots...</p>
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot.time}
                        variant={selectedTime === slot.time ? 'default' : 'outline'}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className="w-full"
                      >
                        {slot.time}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-muted rounded-lg">
                    <p className="text-muted-foreground">
                      No available slots for this date. Please select another date.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Session Information
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Session duration: 30 minutes</li>
                <li>• Ensure you have a stable internet connection</li>
                <li>• Have your identity documents ready</li>
                <li>• Find a quiet, well-lit location</li>
                <li>• You'll receive a confirmation email</li>
              </ul>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => router.push('/video-kyc/sessions')}>
                View My Sessions
              </Button>
              <Button
                onClick={handleSchedule}
                disabled={isLoading || !kycApplicationId || !selectedDate || !selectedTime}
              >
                {isLoading ? 'Scheduling...' : 'Schedule Session'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
