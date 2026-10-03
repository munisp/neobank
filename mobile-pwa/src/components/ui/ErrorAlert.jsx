import React from 'react';
import Alert from './Alert';

export const ErrorAlert = ({ message, error, title = 'Error' }) => (
  <Alert variant="error" title={title} description={message || (error && (error.message || String(error)))} />
);
export default ErrorAlert;
