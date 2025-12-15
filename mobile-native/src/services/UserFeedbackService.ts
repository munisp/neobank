import ApiService from './ApiService';
import AnalyticsEngineService from './AnalyticsEngineService';
import * as Haptics from 'expo-haptics';

export interface FeedbackSurvey {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  targetScreen?: string;
  triggerType: 'manual' | 'screen_view' | 'event' | 'time_based';
  triggerValue?: string;
  frequency: 'once' | 'daily' | 'weekly' | 'always';
  active: boolean;
}

export interface SurveyQuestion {
  id: string;
  type: 'rating' | 'text' | 'multiple_choice' | 'yes_no' | 'nps';
  question: string;
  required: boolean;
  options?: string[];
  minRating?: number;
  maxRating?: number;
}

export interface FeedbackResponse {
  surveyId: string;
  userId?: string;
  deviceId: string;
  responses: QuestionResponse[];
  timestamp: Date;
  screenName?: string;
  sessionId: string;
}

export interface QuestionResponse {
  questionId: string;
  answer: any;
}

export interface SessionRecording {
  id: string;
  sessionId: string;
  userId?: string;
  deviceId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events: RecordingEvent[];
  metadata: {
    platform: string;
    appVersion: string;
    screenResolution: string;
  };
}

export interface RecordingEvent {
  timestamp: Date;
  type: 'screen_view' | 'tap' | 'scroll' | 'input' | 'navigation';
  target?: string;
  value?: any;
  coordinates?: { x: number; y: number };
}

class UserFeedbackService {
  private surveys: Map<string, FeedbackSurvey> = new Map();
  private completedSurveys: Set<string> = new Set();
  private recordingEnabled: boolean = false;
  private currentRecording: SessionRecording | null = null;
  private recordingEvents: RecordingEvent[] = [];

  async initialize(): Promise<void> {
    await this.loadSurveys();
  }

  private async loadSurveys(): Promise<void> {
    try {
      const response = await ApiService.get('/feedback/surveys/active');
      const surveys: FeedbackSurvey[] = response.data.surveys;

      surveys.forEach(survey => {
        this.surveys.set(survey.id, survey);
      });

      console.log(`Loaded ${surveys.length} active surveys`);
    } catch (error) {
      console.error('Failed to load surveys:', error);
    }
  }

  async checkForSurvey(screenName: string): Promise<FeedbackSurvey | null> {
    for (const survey of this.surveys.values()) {
      if (!survey.active) {
        continue;
      }

      // Check if already completed
      if (this.completedSurveys.has(survey.id) && survey.frequency === 'once') {
        continue;
      }

      // Check trigger conditions
      if (survey.triggerType === 'screen_view' && survey.targetScreen === screenName) {
        return survey;
      }
    }

    return null;
  }

  async submitFeedback(surveyId: string, responses: QuestionResponse[]): Promise<void> {
    const survey = this.surveys.get(surveyId);
    if (!survey) {
      throw new Error('Survey not found');
    }

    const feedback: FeedbackResponse = {
      surveyId,
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      responses,
      timestamp: new Date(),
      sessionId: AnalyticsEngineService.getSessionId(),
    };

    // Track in analytics
    await AnalyticsEngineService.trackEvent('survey_completed', 'custom', {
      surveyId,
      surveyTitle: survey.title,
      responseCount: responses.length,
    });

    // Send to middleware for storage in Postgres
    try {
      await ApiService.post('/feedback/responses', feedback);
      this.completedSurveys.add(surveyId);
      
      // Haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      throw error;
    }
  }

  async submitQuickFeedback(
    type: 'bug' | 'feature_request' | 'complaint' | 'praise',
    message: string,
    screenName?: string
  ): Promise<void> {
    const feedback = {
      type,
      message,
      screenName,
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      timestamp: new Date().toISOString(),
      sessionId: AnalyticsEngineService.getSessionId(),
    };

    // Track in analytics
    await AnalyticsEngineService.trackEvent('quick_feedback', 'custom', {
      type,
      screenName,
    });

    // Send to middleware
    try {
      await ApiService.post('/feedback/quick', feedback);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to submit quick feedback:', error);
      throw error;
    }
  }

  async startRecording(): Promise<void> {
    if (this.recordingEnabled) {
      return;
    }

    this.recordingEnabled = true;
    this.recordingEvents = [];

    this.currentRecording = {
      id: `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: AnalyticsEngineService.getSessionId(),
      userId: AnalyticsEngineService.getUserId(),
      deviceId: AnalyticsEngineService.getDeviceId(),
      startTime: new Date(),
      events: [],
      metadata: {
        platform: 'mobile',
        appVersion: '1.0.0',
        screenResolution: '1080x1920',
      },
    };

    console.log('Session recording started');
  }

  async stopRecording(): Promise<void> {
    if (!this.recordingEnabled || !this.currentRecording) {
      return;
    }

    this.recordingEnabled = false;
    this.currentRecording.endTime = new Date();
    this.currentRecording.duration = 
      (this.currentRecording.endTime.getTime() - this.currentRecording.startTime.getTime()) / 1000;
    this.currentRecording.events = [...this.recordingEvents];

    // Send to middleware for storage in Lakehouse
    try {
      await ApiService.post('/feedback/recordings', this.currentRecording);
      console.log('Session recording saved');
    } catch (error) {
      console.error('Failed to save session recording:', error);
    }

    this.currentRecording = null;
    this.recordingEvents = [];
  }

  recordEvent(
    type: RecordingEvent['type'],
    target?: string,
    value?: any,
    coordinates?: { x: number; y: number }
  ): void {
    if (!this.recordingEnabled) {
      return;
    }

    const event: RecordingEvent = {
      timestamp: new Date(),
      type,
      target,
      value,
      coordinates,
    };

    this.recordingEvents.push(event);

    // Auto-stop if recording is too long (10 minutes)
    if (this.currentRecording) {
      const duration = (Date.now() - this.currentRecording.startTime.getTime()) / 1000;
      if (duration > 600) {
        this.stopRecording();
      }
    }
  }

  async getNPSScore(): Promise<number | null> {
    try {
      const response = await ApiService.get('/feedback/nps');
      return response.data.score;
    } catch (error) {
      console.error('Failed to get NPS score:', error);
      return null;
    }
  }

  async getFeedbackStats(): Promise<{
    totalResponses: number;
    averageRating: number;
    npsScore: number;
    bugReports: number;
    featureRequests: number;
  } | null> {
    try {
      const response = await ApiService.get('/feedback/stats');
      return response.data;
    } catch (error) {
      console.error('Failed to get feedback stats:', error);
      return null;
    }
  }

  getSurveys(): FeedbackSurvey[] {
    return Array.from(this.surveys.values());
  }

  isRecording(): boolean {
    return this.recordingEnabled;
  }

  async refreshSurveys(): Promise<void> {
    await this.loadSurveys();
  }
}

export default new UserFeedbackService();

