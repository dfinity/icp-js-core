import { UnexpectedErrorCode, UnknownError } from './errors.ts';
import { Observable, ObservableLog } from './observable.ts';

describe('Observable', () => {
  it('should notify all observers', () => {
    const observable = new Observable<number>();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.subscribe(observer2);
    observable.notify(42);
    expect(observer1).toHaveBeenCalledWith(42);
    expect(observer2).toHaveBeenCalledWith(42);
  });

  it('should notify only subscribed observers', () => {
    const observable = new Observable<number>();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.notify(42);
    expect(observer1).toHaveBeenCalledWith(42);
    expect(observer2).not.toHaveBeenCalled();
  });

  it('should not notify unsubscribed observers', () => {
    const observable = new Observable<number>();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.subscribe(observer2);
    observable.unsubscribe(observer2);
    observable.notify(42);
    expect(observer1).toHaveBeenCalledWith(42);
    expect(observer2).not.toHaveBeenCalled();
  });
});

describe('ObservableLog', () => {
  it('should notify all observers', () => {
    const observable = new ObservableLog();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.subscribe(observer2);
    observable.print('info');
    expect(observer1).toHaveBeenCalledWith({ message: 'info', level: 'info' });
    expect(observer2).toHaveBeenCalledWith({ message: 'info', level: 'info' });
    observable.warn('warning');
    expect(observer1).toHaveBeenCalledWith({ message: 'warning', level: 'warn' });
    expect(observer2).toHaveBeenCalledWith({ message: 'warning', level: 'warn' });
    const error = UnknownError.fromCode(new UnexpectedErrorCode('error'));
    observable.error('error', error);
    expect(observer1).toHaveBeenCalledWith({ message: 'error', level: 'error', error });
    expect(observer2).toHaveBeenCalledWith({ message: 'error', level: 'error', error });
  });

  it('should notify only subscribed observers', () => {
    const observable = new ObservableLog();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.print('info');
    expect(observer1).toHaveBeenCalledWith({ message: 'info', level: 'info' });
    expect(observer2).not.toHaveBeenCalled();
  });

  it('should not notify unsubscribed observers', () => {
    const observable = new ObservableLog();
    const observer1 = jest.fn();
    const observer2 = jest.fn();
    observable.subscribe(observer1);
    observable.subscribe(observer2);
    observable.unsubscribe(observer2);
    observable.print('info');
    expect(observer1).toHaveBeenCalledWith({ message: 'info', level: 'info' });
    expect(observer2).not.toHaveBeenCalled();
  });
});
