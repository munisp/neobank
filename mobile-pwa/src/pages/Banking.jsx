import React from 'react';
import { Navigate } from 'react-router-dom';

// Banking page redirects to Accounts page
const Banking = () => {
  return <Navigate to="/accounts" replace />;
};

export default Banking;
