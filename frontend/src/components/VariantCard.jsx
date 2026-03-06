import React from 'react';
import { Smile, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export default function VariantCard({ variant }) {
    const bodyLen = variant.body?.length || 0;
    const isBodyTooLong = bodyLen > 5000;
    const isBodyTooShort = bodyLen < 1;

    return (
        <div className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-full overflow-hidden">
            <div className="p-4 bg-gray-50 border-b">
                <h4 className="font-semibold text-gray-800 line-clamp-2" title={variant.subject}>Subj: {variant.subject}</h4>
            </div>

            <div className="p-4 flex-grow text-gray-700 text-sm whitespace-pre-wrap overflow-y-auto max-h-64 break-words">
                {variant.body}
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500 mt-auto">
                <div className="flex space-x-4">
                    <span className="flex items-center space-x-1" title={variant.has_emoji ? "Contains Emoji" : "No Emoji"}>
                        <Smile className={clsx("w-4 h-4", variant.has_emoji ? "text-green-500" : "text-gray-300")} />
                    </span>
                    <span className="flex items-center space-x-1" title={variant.has_url ? "Contains URL" : "No URL"}>
                        <LinkIcon className={clsx("w-4 h-4", variant.has_url ? "text-blue-500" : "text-gray-300")} />
                    </span>
                </div>

                <div className="flex items-center space-x-2">
                    <span className={clsx(
                        "px-2 py-1 rounded-full",
                        (isBodyTooLong || isBodyTooShort) ? "bg-red-100 text-red-700 font-semibold flex items-center gap-1" : "bg-gray-200 text-gray-600"
                    )}>
                        {(isBodyTooLong || isBodyTooShort) && <AlertTriangle className="w-3 h-3" />}
                        {bodyLen} chars {isBodyTooLong ? '(Too long!)' : isBodyTooShort ? '(Empty!)' : ''}
                    </span>
                </div>
            </div>

            {(variant.font_styles && Object.keys(variant.font_styles).length > 0) && (
                <div className="px-4 pb-3 pt-1 border-t bg-gray-50 text-xs text-indigo-600 truncate" title={JSON.stringify(variant.font_styles)}>
                    Styles: {JSON.stringify(variant.font_styles)}
                </div>
            )}
        </div>
    );
}
