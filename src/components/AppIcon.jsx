import React from 'react';
import * as LucideIcons from 'lucide-react';
import { HelpCircle } from 'lucide-react';

function Icon({
    name,
    size = 24,
    color = "currentColor",
    className = "",
    strokeWidth = 2,
    ...props
}) {
    if (name === 'NepalRupee') {
        return (
            <span
                className={className}
                style={{
                    fontSize: size,
                    color,
                    lineHeight: 1,
                    fontWeight: 600
                }}
                aria-hidden="true"
            >
                रु
            </span>
        );
    }

    const IconComponent = LucideIcons?.[name];

    if (!IconComponent) {
        return <HelpCircle size={size} color="gray" strokeWidth={strokeWidth} className={className} {...props} />;
    }

    return <IconComponent
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        className={className}
        {...props}
    />;
}
export default Icon;
