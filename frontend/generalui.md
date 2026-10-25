# Global Design System — Modern Fintech

## 1. Objective

Build and maintain a consistent visual identity for the entire financial reconciliation platform.

The product should feel like a modern, trustworthy fintech SaaS application: professional, precise, clean, and designed for financial data and operational workflows.

This prompt defines the shared visual system for every page. Page-specific prompts will define the content, layout, functionality, and business logic.

**Core principle:** Every page should feel like part of the same product, even when its purpose and layout are different.

Before making changes, inspect the existing repository, global styles, shared components, landing page, and Operator Exception Console. Reuse the design system already established instead of creating a new visual style for each page.

Do not replace the existing framework or styling architecture merely to implement a new page.

---

## 2. Design philosophy

Follow these principles throughout the application:

- **Clarity over decoration:** Every visual element should serve a purpose.
- **Trust over flashiness:** The interface should feel reliable and professional.
- **Consistency over novelty:** Reuse established patterns for common interface elements.
- **Hierarchy over density:** Important information should be easy to identify.
- **Functional polish:** Loading, hover, focus, error, success, and disabled states deserve the same attention as the default UI.
- **Progressive complexity:** Show essential information first, with secondary information available when needed.
- **Data integrity:** Financial figures, statuses, and operational results must be accurate and clearly presented.

Avoid generic dashboard designs that rely on excessive statistic cards, oversized headings, gradients, glassmorphism, animated backgrounds, and decorative illustrations.

---

## 3. Global color palette

Use centralized design tokens. These values are the default palette unless the existing project already has compatible tokens that should be preserved.

### Brand colors

- Primary: `#2457D6`
- Primary hover: `#1D46B3`
- Primary subtle background: `#EAF0FF`
- Secondary accent: `#4775D1`

### Backgrounds and surfaces

- Application background: `#F5F7FB`
- Main content surface: `#FFFFFF`
- Secondary surface: `#F0F3F8`
- Subtle hover surface: `#F7F9FC`

### Text

- Primary text: `#172033`
- Secondary text: `#667085`
- Muted text: `#8A94A6`
- Text on primary buttons: `#FFFFFF`

### Borders

- Standard border: `#E4E8F0`
- Stronger border: `#D0D7E2`
- Focus ring: use the primary brand color with an appropriate visible outline.

### Semantic colors

**Success**
- Foreground: `#17805D`
- Background: `#E8F6EF`

**Warning**
- Foreground: `#A86408`
- Background: `#FFF4DF`

**Error**
- Foreground: `#C83C47`
- Background: `#FCEAEC`

**Information**
- Foreground: `#2457D6`
- Background: `#EAF0FF`

### Color usage rules

- Use the primary brand color for primary actions, active navigation, links, and selected elements.
- Use neutral surfaces for most cards, sections, tables, and content areas.
- Reserve semantic colors for meaningful states.
- Never rely on color alone to communicate status; combine it with text, icons, or other indicators.
- Avoid introducing additional accent colors without a clear purpose.
- Do not force the same layout or background treatment onto every page just to create consistency.

---

## 4. Typography

Use Inter if the project does not already have a suitable, consistent sans-serif font.

Establish a reusable type scale:

- Page heading: 26–32px, semibold.
- Section heading: 18–20px, semibold.
- Subsection heading: 15–16px, semibold.
- Body text: 14–15px, regular.
- Supporting text: 12–13px, regular.
- Form labels: 13–14px, medium.
- Numeric financial values: 14–20px, medium or semibold, depending on hierarchy.

Use consistent line heights and avoid excessive font-weight changes.

For IDs, monetary figures, timestamps, and tabular data, use tabular numerals where supported. Keep long identifiers readable and prevent unexpected layout overflow.

Use uppercase labels sparingly, mainly for compact metadata or table headings.

---

## 5. Spacing and geometry

Use a consistent 4px or 8px spacing system.

Suggested spacing values:

- Tight spacing: 4–8px.
- Between related elements: 8–12px.
- Standard component spacing: 12–16px.
- Between sections: 20–28px.
- Major page section spacing: 28–40px.

### Corner radii

- Inputs and small controls: 6–8px.
- Cards and panels: 8–12px.
- Dialogs and larger overlays: 12–16px.
- Pills and badges: fully rounded only when appropriate.

### Borders and shadows

- Prefer thin borders over prominent shadows.
- Use subtle shadows for elevated surfaces such as popovers, dropdowns, and dialogs.
- Avoid giving every card a shadow.
- Use consistent border widths, radii, and surface colors.

Whitespace should establish hierarchy without wasting space, especially on pages containing financial data.

---

## 6. Shared application shell

Use a consistent application shell wherever the page belongs to the main product experience.

### Header

Reuse the established header component and include the appropriate elements for that page:

- Product logo or wordmark.
- Navigation.
- Relevant page links.
- Merchant or tenant context, where applicable.
- Operator or user identity, where supported.
- Contextual actions, where required.

The public landing page may use a marketing-oriented header, while internal workspaces may use an operational header. Both should share typography, brand colors, logo treatment, and interaction patterns.

Do not force internal navigation elements onto public marketing pages where they do not belong.

### Navigation

- Make the active page clear.
- Keep navigation labels consistent across the product.
- Use the project's existing routing library and URL conventions.
- Ensure navigation works with keyboard and pointer input.
- Provide predictable hover and focus states.
- Avoid duplicate navigation systems.

### Page container

Use consistent horizontal alignment and content widths. Avoid arbitrary margins and inconsistent positioning across pages.

For desktop pages, use the available viewport efficiently. On narrower screens, reduce padding and reflow the layout instead of allowing content to become clipped.

---

## 7. Reusable component standards

Before implementing a component that already exists elsewhere, inspect and reuse the existing component.

### Buttons

Define consistent variants:

- **Primary:** Main action, filled brand color.
- **Secondary:** Supporting action, neutral surface and border.
- **Tertiary or ghost:** Low-emphasis actions.
- **Destructive:** Actions that remove, dismiss, or irreversibly alter data.
- **Success:** Positive actions where a distinct success treatment is meaningful.

Buttons must support hover, focus, active, disabled, and loading states.

Avoid giving every button equal visual prominence.

### Inputs and forms

Use a shared style for:

- Text fields.
- Search inputs.
- Select dropdowns.
- Date pickers.
- Checkboxes and radio buttons.
- Textareas.
- Validation messages.

Inputs should have explicit labels, consistent heights, clear focus indicators, and useful error messages.

Do not communicate validation errors only by changing a border color.

### Cards and panels

Use a white or neutral surface, subtle border, appropriate padding, and a clear content hierarchy.

Avoid wrapping every small element in a card. Group information according to its meaning and interaction.

### Tables

Use consistent table typography, header treatment, row heights, borders, and spacing.

Include visible hover and selection states where applicable. Support horizontal overflow or responsive transformations for small screens.

Keep numbers aligned consistently and distinguish missing values from actual zero values.

### Badges and status indicators

Use consistent sizing, padding, typography, and semantic styling.

A status badge should be compact and readable. Use exact business statuses from the backend. Do not create misleading statuses simply to make the interface look complete.

### Dialogs and overlays

Use consistent titles, descriptions, content spacing, footers, and action placement.

Implement accessible focus management, Escape handling when appropriate, and clear cancellation behavior. Use overlays for focused tasks, not for entire page workflows that would be easier as dedicated views.

### Feedback components

Standardize:

- Toast notifications.
- Inline alerts.
- Error messages.
- Loading skeletons.
- Empty states.
- Retry actions.
- Confirmation messages.

Feedback should be concise, actionable, and consistent across the product.

---

## 8. Layout rules

Do not force every page into the same structure. Reuse the design system while choosing the layout according to the page's purpose.

### Marketing and landing pages

- Strong but restrained heading hierarchy.
- Clear primary call to action.
- Consistent navigation and brand presentation.
- Balanced text and visual content.
- Generous whitespace where it improves comprehension.
- Responsive layouts.

### Dashboards

- Prioritize important information and actions.
- Use metrics only where they provide actual value.
- Avoid decorative statistics that do not support the user's workflow.
- Use consistent grids, filters, and content sections.

### Operational workspaces

- Prioritize task completion, data readability, and efficient navigation.
- Keep filters and primary actions easy to access.
- Use tables, comparison panels, timelines, or split views where appropriate.
- Avoid excessive whitespace that reduces the amount of useful information visible.

### Detail and configuration pages

- Group related fields logically.
- Use clear section headings.
- Keep labels and values aligned consistently.
- Distinguish read-only metadata from editable fields.
- Make destructive or high-impact actions visually distinct.

These are layout principles, not rigid templates. Select the appropriate pattern for each page's requirements.

---

## 9. Icons, illustrations, and imagery

Use the icon library already installed in the project.

If no icon library exists, choose a consistent, lightweight icon set before introducing one. Use similarly sized icons with consistent stroke weight.

- Use icons to clarify actions or communicate meaning.
- Use text labels for important actions rather than relying on ambiguous icons alone.
- Keep icons aligned with adjacent text.
- Avoid mixing multiple icon styles.
- Use illustrations and imagery only when they support the page's purpose.
- Avoid decorative imagery on operational pages where it distracts from the data.

Do not use emoji as substitutes for core interface icons.

---

## 10. Interaction and motion

Use restrained, consistent interactions.

Suggested transition duration: 150–200ms for hover, focus, and small state changes.

Provide:

- Button hover and pressed states.
- Input focus states.
- Selected tab and navigation states.
- Clear row selection feedback.
- Dropdown and dialog transitions.
- Loading indicators for asynchronous actions.
- Disabled states when an operation cannot be performed.
- Success and error feedback after operations.

Avoid unnecessary animation, bouncing, large movement, or motion that delays important actions.

Respect reduced-motion preferences and ensure essential functionality does not depend on animation.

---

## 11. Responsive design

Desktop should be supported properly, but every new page must also be usable at smaller widths.

Use responsive layouts appropriate to the content:

- Reflow grids into fewer columns.
- Reduce outer padding on mobile.
- Stack evidence or comparison panels where needed.
- Make navigation accessible on narrow screens.
- Keep forms and dialogs within the viewport.
- Prevent text, IDs, and monetary values from overflowing.
- Use appropriate mobile table behavior.

Do not simply scale down the desktop interface. Adapt the layout to the user's available space and interaction method.

---

## 12. Accessibility

Apply accessibility requirements consistently:

- Use semantic HTML.
- Maintain readable color contrast.
- Provide visible keyboard focus.
- Associate form labels with their inputs.
- Make buttons and interactive rows keyboard accessible.
- Give icon-only controls accessible labels.
- Use proper headings and table semantics.
- Provide useful validation and error feedback.
- Do not rely exclusively on color to communicate meaning.
- Respect reduced-motion preferences.

Accessibility is part of the shared component system, not a page-specific finishing step.

---

## 13. Design tokens and implementation

Implement the theme using the project's existing styling conventions.

If CSS variables are appropriate, establish a centralized theme containing tokens such as:

- `--color-primary`
- `--color-primary-hover`
- `--color-background`
- `--color-surface`
- `--color-surface-muted`
- `--color-text`
- `--color-text-secondary`
- `--color-border`
- `--color-success`
- `--color-warning`
- `--color-error`
- `--radius-control`
- `--radius-card`
- `--radius-dialog`
- `--spacing-*`
- `--shadow-overlay`
- `--font-family`
- `--text-*`

Use equivalent tokens if the project already uses Tailwind configuration, a component library theme, CSS modules, or another styling system.

Do not hardcode slightly different versions of the same color in individual components. Shared components should consume common tokens.

Do not introduce a second component library or styling framework unnecessarily.

---

## 14. Rules for adding every new page

When implementing a new page:

1. Inspect the existing application shell and theme.
2. Read the page-specific requirements carefully.
3. Identify which existing components can be reused.
4. Reuse the established colors, typography, spacing, and component variants.
5. Create new components only where the functionality or information architecture requires them.
6. Preserve existing page behavior and avoid unrelated refactoring.
7. Implement real interactions and connect supported backend operations.
8. Include loading, empty, error, success, and disabled states as applicable.
9. Verify responsive behavior and keyboard accessibility.
10. Test the new page alongside existing pages to detect visual inconsistencies or regressions.

Page-specific requirements take precedence over generic layout suggestions, but must not introduce a competing visual identity.

If a new page genuinely requires a different visual treatment, implement it as a deliberate variation of the shared system rather than an unrelated design.

---

## 15. Definition of done

A new page is complete when:

- It uses the existing global design tokens.
- It reuses the established application shell and shared components where appropriate.
- Its typography, color palette, borders, spacing, and interactions are consistent with the rest of the product.
- It meets the specified functionality and backend contracts.
- It supports loading, empty, error, and success states as appropriate.
- It is usable on desktop and mobile.
- It meets the accessibility requirements above.
- It does not break the existing landing page or Operator Exception Console.
- The project builds successfully and relevant checks pass.

At completion, summarize the components reused or created, any new tokens introduced, the functionality implemented, and the verification performed.

**Final principle:** Keep one recognizable brand and one coherent component system, while allowing each page to have the layout best suited to its purpose.