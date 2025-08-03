"use client"

import React from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Globe, Shield, Link } from 'lucide-react'
import { useConversionStore } from '@/stores/useConversionStore'

export function ZendeskOptions() {
  const { options, updateZendeskOptions } = useConversionStore()
  const zendeskOptions = options.zendeskOptions || {
    sectionId: '',
    locale: 'en-us',
    authorEmail: '',
    preserveAnchors: false,
    visibility: 'public',
    permissionGroupId: '',
    userSegmentId: '',
    removeConditions: true,
    conditionHandling: 'exclude',
    preserveMadCapFeatures: false,
  }

  return (
    <>
      <AccordionItem value="zendesk-general">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Zendesk Settings
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="section-id">Section ID</Label>
                <Input
                  id="section-id"
                  value={zendeskOptions.sectionId || ''}
                  onChange={(e) => updateZendeskOptions({ sectionId: e.target.value })}
                  placeholder="360000000000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="locale">Locale</Label>
                <Select
                  value={zendeskOptions.locale || 'en-us'}
                  onValueChange={(value) => updateZendeskOptions({ locale: value })}
                >
                  <SelectTrigger id="locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-us">English (US)</SelectItem>
                    <SelectItem value="en-gb">English (UK)</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="author-email">Author email</Label>
              <Input
                id="author-email"
                type="email"
                value={zendeskOptions.authorEmail || ''}
                onChange={(e) => updateZendeskOptions({ authorEmail: e.target.value })}
                placeholder="docs@example.com"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="preserve-anchors"
                checked={zendeskOptions.preserveAnchors || false}
                onCheckedChange={(checked) => updateZendeskOptions({ preserveAnchors: checked })}
              />
              <Label htmlFor="preserve-anchors">Preserve anchor links</Label>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="zendesk-permissions">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Permissions & Visibility
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="visibility">Article visibility</Label>
              <Select
                value={zendeskOptions.visibility || 'public'}
                onValueChange={(value: any) => updateZendeskOptions({ visibility: value })}
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal (logged in users)</SelectItem>
                  <SelectItem value="staff">Staff only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="permission-group">Permission group ID</Label>
                <Input
                  id="permission-group"
                  value={zendeskOptions.permissionGroupId || ''}
                  onChange={(e) => updateZendeskOptions({ permissionGroupId: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="user-segment">User segment ID</Label>
                <Input
                  id="user-segment"
                  value={zendeskOptions.userSegmentId || ''}
                  onChange={(e) => updateZendeskOptions({ userSegmentId: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="zendesk-content">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Content Processing
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="remove-conditions"
                checked={zendeskOptions.removeConditions !== false}
                onCheckedChange={(checked) => updateZendeskOptions({ removeConditions: checked })}
              />
              <Label htmlFor="remove-conditions">Remove MadCap conditions</Label>
            </div>
            
            {!zendeskOptions.removeConditions && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="condition-handling">Condition handling</Label>
                <Select
                  value={zendeskOptions.conditionHandling || 'exclude'}
                  onValueChange={(value: any) => updateZendeskOptions({ conditionHandling: value })}
                >
                  <SelectTrigger id="condition-handling">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude">Exclude conditional content</SelectItem>
                    <SelectItem value="include">Include all content</SelectItem>
                    <SelectItem value="convert">Convert to Zendesk format</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              <Switch
                id="preserve-madcap"
                checked={zendeskOptions.preserveMadCapFeatures || false}
                onCheckedChange={(checked) => updateZendeskOptions({ preserveMadCapFeatures: checked })}
              />
              <Label htmlFor="preserve-madcap">Preserve MadCap-specific features</Label>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}