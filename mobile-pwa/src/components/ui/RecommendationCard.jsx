import React from 'react';
import Card from './Card';
import Button from './Button';

export const RecommendationCard = ({ title, description, actionLabel, onAction, imageUrl }) => (
  <Card className="p-4 flex gap-3 items-center">
    {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 rounded-md object-cover" />}
    <div className="flex-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
    {actionLabel && <Button size="sm" onClick={onAction}>{actionLabel}</Button>}
  </Card>
);
export default RecommendationCard;
