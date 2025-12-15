import React from 'react';
import { Navigate } from 'react-router-dom';

// Cards page redirects to CardManagement page
const Cards = () => {
  return <Navigate to="/cards" replace />;
};

export default Cards;
