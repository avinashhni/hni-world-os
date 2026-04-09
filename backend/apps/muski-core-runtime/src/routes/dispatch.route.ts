import { TaskDispatcherService } from "../services/task-dispatcher.service";
import { TaskInput } from "../services/task-intake.service";

export function createDispatchRoute(dispatcher: TaskDispatcherService) {
  return (task: TaskInput) => {
    const result = dispatcher.dispatch(task);

    return {
      success: true,
      dispatch: result,
    };
  };
}