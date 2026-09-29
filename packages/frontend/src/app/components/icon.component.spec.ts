import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  it('renders the requested SVG icon at the given size, hidden from screen readers', async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'download');
    fixture.componentRef.setInput('size', 20);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
